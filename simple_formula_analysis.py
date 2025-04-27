#!/usr/bin/env python3

import math

# Data from our analysis
data = {
    4: {"median": 110, "mean": 120, "min": 103, "max": 207, "range": 104},
    5: {"median": 3932, "mean": 4542, "min": 400, "max": 14663, "range": 14263},
    6: {"median": 716, "mean": 3968, "min": 338, "max": 52522, "range": 52184},
    7: {
        "median": 367583,
        "mean": 2361100,
        "min": 2368,
        "max": 28861848,
        "range": 28859480,
    },
}

print("=== KENKEN DIFFICULTY FORMULA ANALYSIS ===\n")

sizes = [4, 5, 6, 7]
medians = [data[s]["median"] for s in sizes]
means = [data[s]["mean"] for s in sizes]


# Simple exponential fitting y = a * b^x
def fit_exponential(x_vals, y_vals):
    """Fit exponential model using log transformation"""
    log_y = [math.log(y) for y in y_vals]
    n = len(x_vals)

    x_mean = sum(x_vals) / n
    log_y_mean = sum(log_y) / n

    numerator = sum((x_vals[i] - x_mean) * (log_y[i] - log_y_mean) for i in range(n))
    denominator = sum((x_vals[i] - x_mean) ** 2 for i in range(n))

    log_b = numerator / denominator
    log_a = log_y_mean - log_b * x_mean

    a = math.exp(log_a)
    b = math.exp(log_b)

    return a, b


# Simple power fitting y = a * x^b
def fit_power(x_vals, y_vals):
    """Fit power model using log transformation"""
    log_x = [math.log(x) for x in x_vals]
    log_y = [math.log(y) for y in y_vals]
    n = len(x_vals)

    log_x_mean = sum(log_x) / n
    log_y_mean = sum(log_y) / n

    numerator = sum((log_x[i] - log_x_mean) * (log_y[i] - log_y_mean) for i in range(n))
    denominator = sum((log_x[i] - log_x_mean) ** 2 for i in range(n))

    b = numerator / denominator
    log_a = log_y_mean - b * log_x_mean

    a = math.exp(log_a)

    return a, b


def calculate_r_squared(actual, predicted):
    """Calculate R-squared"""
    mean_actual = sum(actual) / len(actual)
    ss_tot = sum((y - mean_actual) ** 2 for y in actual)
    ss_res = sum((actual[i] - predicted[i]) ** 2 for i in range(len(actual)))
    return 1 - (ss_res / ss_tot) if ss_tot > 0 else 1.0


print("=== FITTING MODELS TO MEDIAN VALUES ===")

# Exponential model
print("\nExponential Model: Operations = a × b^n")
a_exp, b_exp = fit_exponential(sizes, medians)
predicted_exp = [a_exp * (b_exp**s) for s in sizes]
r2_exp = calculate_r_squared(medians, predicted_exp)

print(f"  Formula: Operations = {a_exp:.1f} × {b_exp:.3f}^n")
print(f"  R² = {r2_exp:.4f}")
print("  Predictions vs Actual:")
for i, s in enumerate(sizes):
    pred = predicted_exp[i]
    actual = medians[i]
    error = abs(pred - actual) / actual * 100
    print(f"    {s}x{s}: {pred:,.0f} vs {actual:,.0f} (error: {error:.1f}%)")

# Power model
print("\nPower Model: Operations = a × n^b")
a_pow, b_pow = fit_power(sizes, medians)
predicted_pow = [a_pow * (s**b_pow) for s in sizes]
r2_pow = calculate_r_squared(medians, predicted_pow)

print(f"  Formula: Operations = {a_pow:.1f} × n^{b_pow:.3f}")
print(f"  R² = {r2_pow:.4f}")
print("  Predictions vs Actual:")
for i, s in enumerate(sizes):
    pred = predicted_pow[i]
    actual = medians[i]
    error = abs(pred - actual) / actual * 100
    print(f"    {s}x{s}: {pred:,.0f} vs {actual:,.0f} (error: {error:.1f}%)")

# Determine best model
best_model = "Exponential" if r2_exp > r2_pow else "Power"
best_r2 = max(r2_exp, r2_pow)
best_params = (a_exp, b_exp) if r2_exp > r2_pow else (a_pow, b_pow)

print(f"\n=== BEST MODEL ===")
print(f"Best fitting model: {best_model}")
print(f"R² = {best_r2:.4f}")

if best_model == "Exponential":
    print(f"Formula: Operations = {best_params[0]:.1f} × {best_params[1]:.3f}^n")
    # Predictions for larger sizes
    print(f"\n=== PREDICTIONS FOR LARGER SIZES ===")
    for size in [8, 9, 10]:
        pred = best_params[0] * (best_params[1] ** size)
        print(f"{size}x{size}: {pred:,.0f} operations")
        if pred > 1e9:
            print(f"  That's {pred / 1e9:.1f} billion operations!")
else:
    print(f"Formula: Operations = {best_params[0]:.1f} × n^{best_params[1]:.3f}")
    # Predictions for larger sizes
    print(f"\n=== PREDICTIONS FOR LARGER SIZES ===")
    for size in [8, 9, 10]:
        pred = best_params[0] * (size ** best_params[1])
        print(f"{size}x{size}: {pred:,.0f} operations")
        if pred > 1e9:
            print(f"  That's {pred / 1e9:.1f} billion operations!")

print(f"\n=== VARIANCE ANALYSIS ===")
print("Range (max - min) by size:")
ranges = [data[s]["range"] for s in sizes]

for i, s in enumerate(sizes):
    range_val = ranges[i]
    median_val = medians[i]
    coefficient_of_variation = (range_val / 4) / median_val  # rough CV estimate
    print(f"{s}x{s}: Range = {range_val:,}, CV ≈ {coefficient_of_variation:.2f}")

print(f"\n=== COMPLEXITY INSIGHTS ===")
print("Operations per cell:")
for s in sizes:
    ops_per_cell = medians[sizes.index(s)] / (s * s)
    print(f"{s}x{s}: {ops_per_cell:,.0f} operations per cell")

print(f"\nGrowth rate analysis:")
for i in range(1, len(sizes)):
    prev_median = medians[i - 1]
    curr_median = medians[i]
    growth_factor = curr_median / prev_median
    print(
        f"{sizes[i - 1]}x{sizes[i - 1]} to {sizes[i]}x{sizes[i]}: {growth_factor:.1f}x increase"
    )

print(f"\n=== PRACTICAL IMPLICATIONS ===")
print("Estimated solving times (assuming 1M operations/second):")
for s in sizes:
    median_ops = medians[sizes.index(s)]
    time_seconds = median_ops / 1_000_000
    if time_seconds < 1:
        print(f"{s}x{s}: {time_seconds * 1000:.0f} milliseconds")
    elif time_seconds < 60:
        print(f"{s}x{s}: {time_seconds:.1f} seconds")
    elif time_seconds < 3600:
        print(f"{s}x{s}: {time_seconds / 60:.1f} minutes")
    else:
        print(f"{s}x{s}: {time_seconds / 3600:.1f} hours")

# Predictions with best model
if best_model == "Exponential":
    for size in [8, 9, 10]:
        pred_ops = best_params[0] * (best_params[1] ** size)
        time_seconds = pred_ops / 1_000_000
        if time_seconds < 3600:
            print(f"{size}x{size}: {time_seconds / 60:.0f} minutes")
        elif time_seconds < 86400:
            print(f"{size}x{size}: {time_seconds / 3600:.1f} hours")
        else:
            print(f"{size}x{size}: {time_seconds / 86400:.1f} days")

print(f"\n=== RECOMMENDED FORMULA ===")
if best_model == "Exponential":
    a, b = best_params
    print(f"Median Operations ≈ {a:.0f} × {b:.2f}^n")
    print(f"where n is puzzle size (4, 5, 6, 7, etc.)")
    print(f"\nSimplified: Operations ≈ {a:.0f} × {b:.1f}^n")
    print(f"R² = {best_r2:.3f} (explains {best_r2 * 100:.1f}% of variance)")
else:
    a, b = best_params
    print(f"Median Operations ≈ {a:.0f} × n^{b:.2f}")
    print(f"where n is puzzle size (4, 5, 6, 7, etc.)")
    print(f"R² = {best_r2:.3f} (explains {best_r2 * 100:.1f}% of variance)")

print(f"\nNote: Actual operations can vary significantly due to:")
print("- Random cage generation patterns")
print("- Different constraint propagation effectiveness")
print("- Backtracking path variations")
print("- Multiple solution detection overhead")
