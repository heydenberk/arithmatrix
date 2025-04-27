#!/usr/bin/env python3

import math


# Simple curve fitting without scipy
def simple_exponential_fit(x_vals, y_vals):
    """Fit y = a * b^x using least squares on log-transformed data"""
    # Transform to log space: log(y) = log(a) + x*log(b)
    log_y = [math.log(y) for y in y_vals]
    n = len(x_vals)

    # Calculate means
    x_mean = sum(x_vals) / n
    log_y_mean = sum(log_y) / n

    # Calculate slope (log_b) and intercept (log_a)
    numerator = sum((x_vals[i] - x_mean) * (log_y[i] - log_y_mean) for i in range(n))
    denominator = sum((x_vals[i] - x_mean) ** 2 for i in range(n))

    if denominator == 0:
        return None, None

    log_b = numerator / denominator
    log_a = log_y_mean - log_b * x_mean

    a = math.exp(log_a)
    b = math.exp(log_b)

    return a, b


def simple_power_fit(x_vals, y_vals):
    """Fit y = a * x^b using least squares on log-transformed data"""
    # Transform to log space: log(y) = log(a) + b*log(x)
    log_x = [math.log(x) for x in x_vals]
    log_y = [math.log(y) for y in y_vals]
    n = len(x_vals)

    # Calculate means
    log_x_mean = sum(log_x) / n
    log_y_mean = sum(log_y) / n

    # Calculate slope (b) and intercept (log_a)
    numerator = sum((log_x[i] - log_x_mean) * (log_y[i] - log_y_mean) for i in range(n))
    denominator = sum((log_x[i] - log_x_mean) ** 2 for i in range(n))

    if denominator == 0:
        return None, None

    b = numerator / denominator
    log_a = log_y_mean - b * log_x_mean

    a = math.exp(log_a)

    return a, b


def calculate_r_squared(actual, predicted):
    """Calculate R-squared value"""
    mean_actual = sum(actual) / len(actual)
    ss_tot = sum((y - mean_actual) ** 2 for y in actual)
    ss_res = sum((actual[i] - predicted[i]) ** 2 for i in range(len(actual)))

    if ss_tot == 0:
        return 1.0 if ss_res == 0 else 0.0

    return 1 - (ss_res / ss_tot)


# Data from our analysis
data = {
    4: {
        "median": 110,
        "mean": 120,
        "min": 103,
        "max": 207,
        "sample_size": 11,
        "range": 207 - 103,
        "std_approx": (207 - 103) / 4,  # rough estimate
    },
    5: {
        "median": 3932,
        "mean": 4542,
        "min": 400,
        "max": 14663,
        "sample_size": 12,
        "range": 14663 - 400,
        "std_approx": (14663 - 400) / 4,
    },
    6: {
        "median": 716,
        "mean": 3968,
        "min": 338,
        "max": 52522,
        "sample_size": 17,
        "range": 52522 - 338,
        "std_approx": (52522 - 338) / 4,
    },
    7: {
        "median": 367583,
        "mean": 2361100,
        "min": 2368,
        "max": 28861848,
        "sample_size": 66,
        "range": 28861848 - 2368,
        "std_approx": 5102119,  # actual from our data
    },
}

sizes = list(data.keys())
medians = [data[s]["median"] for s in sizes]
means = [data[s]["mean"] for s in sizes]
mins = [data[s]["min"] for s in sizes]
maxs = [data[s]["max"] for s in sizes]

print("=== KENKEN DIFFICULTY FORMULA ANALYSIS ===\n")


# 1. Exponential models
def exponential_model(n, a, b):
    """Operations = a * b^n"""
    return a * (b**n)


def power_model(n, a, b):
    """Operations = a * n^b"""
    return a * (n**b)


def factorial_model(n, a, b):
    """Operations = a * (n!)^b"""
    return a * (math.factorial(int(n)) ** b)


def exponential_squared_model(n, a, b):
    """Operations = a * b^(n^2)"""
    return a * (b ** (n**2))


# Fit different models to median values
print("=== FITTING MODELS TO MEDIAN VALUES ===")

models = [
    ("Exponential: a * b^n", exponential_model),
    ("Power: a * n^b", power_model),
    ("Exponential Squared: a * b^(n^2)", exponential_squared_model),
]

best_models = []

for name, model in models:
    try:
        if "factorial" in name.lower():
            # Special handling for factorial
            popt, pcov = curve_fit(model, sizes, medians, p0=[1, 0.5], maxfev=5000)
        else:
            popt, pcov = curve_fit(model, sizes, medians, maxfev=5000)

        # Calculate R-squared
        predicted = [model(s, *popt) for s in sizes]
        ss_res = sum((medians[i] - predicted[i]) ** 2 for i in range(len(medians)))
        ss_tot = sum((medians[i] - np.mean(medians)) ** 2 for i in range(len(medians)))
        r_squared = 1 - (ss_res / ss_tot)

        print(f"\n{name}:")
        print(f"  Parameters: a={popt[0]:.2e}, b={popt[1]:.3f}")
        print(f"  R²: {r_squared:.4f}")
        print("  Predictions vs Actual:")
        for i, s in enumerate(sizes):
            pred = model(s, *popt)
            actual = medians[i]
            error = abs(pred - actual) / actual * 100
            print(f"    {s}x{s}: {pred:,.0f} vs {actual:,.0f} (error: {error:.1f}%)")

        best_models.append((r_squared, name, popt, model))

    except Exception as e:
        print(f"\n{name}: Failed to fit - {e}")

# Sort by R-squared
best_models.sort(reverse=True, key=lambda x: x[0])

print(f"\n=== BEST FITTING MODEL ===")
if best_models:
    r_sq, name, params, model_func = best_models[0]
    print(f"Best model: {name}")
    print(f"R² = {r_sq:.4f}")
    print(f"Parameters: a={params[0]:.2e}, b={params[1]:.3f}")

    # Predict for larger sizes
    print(f"\n=== PREDICTIONS FOR LARGER SIZES ===")
    for size in [8, 9, 10]:
        pred = model_func(size, *params)
        print(f"{size}x{size} predicted median: {pred:,.0f} operations")
        if pred > 1e9:
            print(f"  That's {pred / 1e9:.1f} billion operations!")

# Analysis of variance scaling
print(f"\n=== VARIANCE SCALING ANALYSIS ===")
print("How does the range (max-min) scale with size?")

ranges = [data[s]["range"] for s in sizes]
range_model_fits = []

for name, model in [("Exponential", exponential_model), ("Power", power_model)]:
    try:
        popt, pcov = curve_fit(model, sizes, ranges, maxfev=5000)
        predicted = [model(s, *popt) for s in sizes]
        ss_res = sum((ranges[i] - predicted[i]) ** 2 for i in range(len(ranges)))
        ss_tot = sum((ranges[i] - np.mean(ranges)) ** 2 for i in range(len(ranges)))
        r_squared = 1 - (ss_res / ss_tot)

        print(f"\nRange {name} model: R² = {r_squared:.4f}")
        print(f"  Parameters: a={popt[0]:.2e}, b={popt[1]:.3f}")

        range_model_fits.append((r_squared, name, popt, model))
    except:
        pass

# Complexity analysis
print(f"\n=== COMPLEXITY ANALYSIS ===")
print("Operations per cell:")
for s in sizes:
    ops_per_cell = data[s]["median"] / (s * s)
    print(f"{s}x{s}: {ops_per_cell:,.0f} operations per cell")

print(f"\nOperations per constraint (rough estimate):")
print("Assuming ~2*n row/col constraints + ~n cage constraints = 3n total")
for s in sizes:
    constraints = 3 * s  # rough estimate
    ops_per_constraint = data[s]["median"] / constraints
    print(f"{s}x{s}: {ops_per_constraint:,.0f} operations per constraint")

# Generate a practical formula
print(f"\n=== PRACTICAL FORMULAS ===")
if best_models:
    r_sq, name, params, model_func = best_models[0]
    a, b = params

    if "Exponential" in name and "Squared" not in name:
        print(f"Median Operations ≈ {a:.0f} × {b:.2f}^n")
        print(f"Where n is the puzzle size (e.g., n=7 for 7x7)")

        # Create confidence intervals using variance data
        print(f"\nConfidence intervals (rough estimates):")
        print("Based on observed variance patterns...")

        for size in [4, 5, 6, 7, 8]:
            median_pred = model_func(size, a, b)
            # Estimate variance growth (appears to grow exponentially too)
            if size <= 7:
                actual_range = data.get(size, {}).get("range", 0)
                std_estimate = actual_range / 4
            else:
                # Extrapolate variance growth
                std_estimate = median_pred * 2  # rough estimate based on patterns

            lower = max(1, median_pred - std_estimate)
            upper = median_pred + std_estimate

            print(
                f"{size}x{size}: {lower:,.0f} - {upper:,.0f} operations (median ≈ {median_pred:,.0f})"
            )

# Summary insights
print(f"\n=== KEY INSIGHTS ===")
print("1. Difficulty grows exponentially with puzzle size")
print("2. Variance also grows exponentially - larger puzzles have huge variance")
print("3. The 6x6 anomaly suggests generation randomness affects results significantly")
print(
    "4. 8x8+ puzzles would likely be computationally prohibitive for real-time solving"
)
print("5. Formula should be used as rough estimates due to high variance")
