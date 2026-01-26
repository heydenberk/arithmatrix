import random
from typing import Dict, List

import numpy as np


# Precomputed Latin square pool for faster generation
# Lazily initialized on first use
_LATIN_SQUARE_POOL: Dict[int, List[np.ndarray]] = {}
_POOL_SIZES = {4: 500, 5: 500, 6: 300, 7: 200}


def _get_adaptive_steps(n: int) -> int:
    """
    Get optimal isotopy move count based on grid size.
    Empirically tuned for good randomness without excessive computation.
    """
    # Formula: n^1.5 * 10 provides good randomness
    # 4x4: 80, 5x5: 112, 6x6: 147, 7x7: 185
    return int(n ** 1.5 * 10)


def get_base_square(n: int) -> np.ndarray:
    """Cyclic Latin square (addition table of ℤₙ)."""
    return (np.arange(n)[:, None] + np.arange(n)) % n + 1


def _random_isotopy_move(square: np.ndarray) -> None:
    """One of: swap 2 rows, swap 2 cols, or swap 2 symbols – always legal."""
    n = square.shape[0]
    move = np.random.randint(3)
    if move == 0:  # row swap
        r1, r2 = np.random.choice(n, 2, replace=False)
        square[[r1, r2], :] = square[[r2, r1], :]
    elif move == 1:  # column swap
        c1, c2 = np.random.choice(n, 2, replace=False)
        square[:, [c1, c2]] = square[:, [c2, c1]]
    else:  # symbol swap
        a, b = np.random.choice(n, 2, replace=False) + 1  # symbols are 1…n
        mask_a, mask_b = square == a, square == b
        square[mask_a], square[mask_b] = b, a


def _generate_latin_square_fresh(n: int, max_steps: int | None = None) -> np.ndarray:
    """
    Generate a fresh randomized Latin square using isotopy moves.
    """
    if max_steps is None:
        max_steps = _get_adaptive_steps(n)

    square = get_base_square(n)

    for _ in range(max_steps):
        _random_isotopy_move(square)

    return square


def _initialize_pool(n: int) -> None:
    """Initialize the Latin square pool for a given size."""
    if n in _LATIN_SQUARE_POOL:
        return

    pool_size = _POOL_SIZES.get(n, 100)
    _LATIN_SQUARE_POOL[n] = [
        _generate_latin_square_fresh(n) for _ in range(pool_size)
    ]


def get_latin_square(n: int, max_steps: int | None = None, use_pool: bool = True) -> np.ndarray:
    """
    Generate a randomized Latin square using isotopy moves:
    • Random row swaps, column swaps, and symbol swaps
    • Works well for all square sizes

    Args:
        n: Size of the Latin square
        max_steps: Number of isotopy moves (default: adaptive based on size)
        use_pool: If True, sample from precomputed pool (faster)

    Returns:
        A randomized n×n Latin square
    """
    # Use pool for supported sizes when requested
    if use_pool and n in _POOL_SIZES:
        _initialize_pool(n)
        # Return a copy to avoid modifying the pooled square
        # Also apply a few random moves for additional variety
        base = random.choice(_LATIN_SQUARE_POOL[n]).copy()
        # Apply 3-5 additional random moves for variety
        for _ in range(random.randint(3, 5)):
            _random_isotopy_move(base)
        return base

    # Fall back to fresh generation
    return _generate_latin_square_fresh(n, max_steps)


def is_valid_latin_square(square: np.ndarray) -> bool:
    """Assert that every row and column contains each number exactly once."""
    n = square.shape[0]
    expected = set(range(1, n + 1))
    for i in range(n):
        if set(square[i, :]) != expected:
            return False
        if set(square[:, i]) != expected:
            return False
    return True


def warm_up_pool(sizes: List[int] | None = None) -> None:
    """
    Pre-initialize the Latin square pool for specified sizes.
    Call this at startup to avoid cold-start latency.
    """
    if sizes is None:
        sizes = list(_POOL_SIZES.keys())

    for n in sizes:
        _initialize_pool(n)


if __name__ == "__main__":
    import time

    # Test pool warm-up
    print("Warming up Latin square pool...")
    start = time.time()
    warm_up_pool()
    print(f"Pool initialized in {time.time() - start:.2f}s")

    # Benchmark pooled vs fresh generation
    print("\nBenchmarking generation speed:")
    for n in [4, 5, 6, 7]:
        # Pooled
        start = time.time()
        for _ in range(1000):
            get_latin_square(n, use_pool=True)
        pooled_time = time.time() - start

        # Fresh
        start = time.time()
        for _ in range(1000):
            get_latin_square(n, use_pool=False)
        fresh_time = time.time() - start

        print(f"  {n}x{n}: pooled={pooled_time:.3f}s, fresh={fresh_time:.3f}s, speedup={fresh_time/pooled_time:.1f}x")

    # Validate
    print("\nValidating 10,000 generated squares...")
    for _ in range(10_000):
        square = get_latin_square(7)
        if not is_valid_latin_square(square):
            print("Invalid square found!")
            print(square)
            break
    else:
        print("All squares valid!")
