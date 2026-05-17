// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../tokens/LPToken.sol";

/// @title AMMPool - Constant product AMM (x * y = k) with fee mechanism
/// @notice Implements core DEX functionality: add/remove liquidity, swap tokens
contract AMMPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── State ───────────────────────────────────────────────────────────────
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    LPToken public immutable lpToken;

    uint256 public reserveA;
    uint256 public reserveB;

    /// @notice Swap fee in basis points (30 = 0.3%)
    uint256 public feeBps = 30;
    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public constant MINIMUM_LIQUIDITY = 1_000;

    // ─── Events ──────────────────────────────────────────────────────────────
    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 lpBurned);
    event Swap(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut);
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address _tokenA, address _tokenB, address initialOwner)
        Ownable(initialOwner)
    {
        require(_tokenA != address(0) && _tokenB != address(0), "AMMPool: zero address");
        require(_tokenA != _tokenB, "AMMPool: identical tokens");
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        lpToken = new LPToken(address(this));
    }

    // ─── Liquidity ───────────────────────────────────────────────────────────

    /// @notice Add liquidity to the pool
    /// @param amountADesired Amount of tokenA to deposit
    /// @param amountBDesired Amount of tokenB to deposit
    /// @param amountAMin Minimum tokenA accepted (slippage protection)
    /// @param amountBMin Minimum tokenB accepted (slippage protection)
    function addLiquidity(
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) external nonReentrant returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _calculateOptimalAmounts(
            amountADesired, amountBDesired, amountAMin, amountBMin
        );

        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);

        liquidity = _mintLP(msg.sender, amountA, amountB);

        _updateReserves();
        emit LiquidityAdded(msg.sender, amountA, amountB, liquidity);
    }

    /// @notice Remove liquidity from the pool
    /// @param lpAmount Amount of LP tokens to burn
    /// @param amountAMin Minimum tokenA to receive
    /// @param amountBMin Minimum tokenB to receive
    function removeLiquidity(
        uint256 lpAmount,
        uint256 amountAMin,
        uint256 amountBMin
    ) external nonReentrant returns (uint256 amountA, uint256 amountB) {
        require(lpAmount > 0, "AMMPool: zero LP amount");
        uint256 totalLP = lpToken.totalSupply();

        amountA = (lpAmount * reserveA) / totalLP;
        amountB = (lpAmount * reserveB) / totalLP;

        require(amountA >= amountAMin, "AMMPool: insufficient A output");
        require(amountB >= amountBMin, "AMMPool: insufficient B output");

        lpToken.burn(msg.sender, lpAmount);
        tokenA.safeTransfer(msg.sender, amountA);
        tokenB.safeTransfer(msg.sender, amountB);

        _updateReserves();
        emit LiquidityRemoved(msg.sender, amountA, amountB, lpAmount);
    }

    // ─── Swap ─────────────────────────────────────────────────────────────────

    /// @notice Swap exact tokenA for tokenB
    function swapAForB(uint256 amountIn, uint256 amountOutMin)
        external nonReentrant returns (uint256 amountOut)
    {
        require(amountIn > 0, "AMMPool: zero input");
        amountOut = getAmountOut(amountIn, reserveA, reserveB);
        require(amountOut >= amountOutMin, "AMMPool: slippage exceeded");

        tokenA.safeTransferFrom(msg.sender, address(this), amountIn);
        tokenB.safeTransfer(msg.sender, amountOut);

        _updateReserves();
        emit Swap(msg.sender, address(tokenA), amountIn, amountOut);
    }

    /// @notice Swap exact tokenB for tokenA
    function swapBForA(uint256 amountIn, uint256 amountOutMin)
        external nonReentrant returns (uint256 amountOut)
    {
        require(amountIn > 0, "AMMPool: zero input");
        amountOut = getAmountOut(amountIn, reserveB, reserveA);
        require(amountOut >= amountOutMin, "AMMPool: slippage exceeded");

        tokenB.safeTransferFrom(msg.sender, address(this), amountIn);
        tokenA.safeTransfer(msg.sender, amountOut);

        _updateReserves();
        emit Swap(msg.sender, address(tokenB), amountIn, amountOut);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Update swap fee (governance can call via timelock)
    function setFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 100, "AMMPool: fee too high"); // max 1%
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /// @notice Calculate output amount using constant product formula with fee
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public view returns (uint256)
    {
        require(amountIn > 0, "AMMPool: zero input");
        require(reserveIn > 0 && reserveOut > 0, "AMMPool: insufficient liquidity");

        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeBps);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * FEE_DENOMINATOR) + amountInWithFee;
        return numerator / denominator;
    }

    /// @notice Get current spot price of tokenA in terms of tokenB (scaled 1e18)
    function getSpotPrice() external view returns (uint256) {
        require(reserveA > 0, "AMMPool: no liquidity");
        return (reserveB * 1e18) / reserveA;
    }

    /// @notice Get pool reserves
    function getReserves() external view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _calculateOptimalAmounts(
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal view returns (uint256 amountA, uint256 amountB) {
        if (reserveA == 0 && reserveB == 0) {
            return (amountADesired, amountBDesired);
        }
        uint256 amountBOptimal = (amountADesired * reserveB) / reserveA;
        if (amountBOptimal <= amountBDesired) {
            require(amountBOptimal >= amountBMin, "AMMPool: insufficient B amount");
            return (amountADesired, amountBOptimal);
        }
        uint256 amountAOptimal = (amountBDesired * reserveA) / reserveB;
        require(amountAOptimal >= amountAMin, "AMMPool: insufficient A amount");
        return (amountAOptimal, amountBDesired);
    }

    function _mintLP(address to, uint256 amountA, uint256 amountB)
        internal returns (uint256 liquidity)
    {
        uint256 totalLP = lpToken.totalSupply();
        if (totalLP == 0) {
            liquidity = _sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
            // Lock minimum liquidity forever (send to address(1))
            lpToken.mint(address(1), MINIMUM_LIQUIDITY);
        } else {
            uint256 liqA = (amountA * totalLP) / reserveA;
            uint256 liqB = (amountB * totalLP) / reserveB;
            liquidity = liqA < liqB ? liqA : liqB;
        }
        require(liquidity > 0, "AMMPool: insufficient liquidity minted");
        lpToken.mint(to, liquidity);
    }

    function _updateReserves() internal {
        reserveA = tokenA.balanceOf(address(this));
        reserveB = tokenB.balanceOf(address(this));
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
