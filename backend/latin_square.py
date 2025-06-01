import numpy as np


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


def get_latin_square(n: int, max_steps: int | None = None) -> np.ndarray:
    """
    Generate a randomized Latin square using isotopy moves:
    • Random row swaps, column swaps, and symbol swaps
    • Works well for all square sizes
    """
    if max_steps is None:
        max_steps = n**2

    square = get_base_square(n)

    # Use isotopy moves for all sizes (previously only used for odd n)
    for _ in range(max_steps):
        _random_isotopy_move(square)

    return square


def is_valid_latin_square(square: np.ndarray) -> bool:
    # Assert that every row and column contains each number exactly once
    return np.all(np.unique(square, axis=0)) and np.all(np.unique(square, axis=1))


if __name__ == "__main__":
    for _ in range(10_000):
        square = get_latin_square(7, max_steps=100)
        if not is_valid_latin_square(square):
            print("Invalid square")
            print(square)
            break
