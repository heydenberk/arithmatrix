#!/bin/bash

# Test parallel KenKen puzzle generation script
# Generates 20 puzzles per size (4,5,6,7) using parallel batches of 5

set -e  # Exit on error

# Create output directory
mkdir -p test_parallel_output

# Function to generate a batch
generate_batch() {
    local size=$1
    local batch_num=$2
    local config_file="test_parallel_output/config_${size}_${batch_num}.json"
    local output_file="test_parallel_output/batch_${size}_${batch_num}.jsonl"
    
    # Create config for 5 puzzles of this size
    echo "{\"$size\": 5}" > "$config_file"
    
    # Generate the batch
    echo "Starting batch $batch_num for size ${size}x${size}..."
    python batch_puzzle_generator.py --config custom --custom-config "$config_file" --output-file "$output_file"
    
    # Clean up config file
    rm "$config_file"
    
    echo "Completed batch $batch_num for size ${size}x${size}"
}

# Export function so xargs can use it
export -f generate_batch

echo "🧩 Starting TEST parallel KenKen generation..."
echo "📊 Target: 20 puzzles each of sizes 4x4, 5x5, 6x6, 7x7"
echo "⚡ Method: 4 parallel batches of 5 puzzles per size"
echo ""

start_time=$(date +%s)

# Create list of all size/batch combinations (4 batches per size)
{
    for size in 4 5 6 7; do
        for batch in {1..4}; do
            echo "$size $batch"
        done
    done
} | xargs -n 2 -P 4 bash -c 'generate_batch "$@"' _

echo ""
echo "✅ All batches completed! Combining files..."

# Combine all files by size
for size in 4 5 6 7; do
    output_file="test_puzzles_${size}x${size}.jsonl"
    cat test_parallel_output/batch_${size}_*.jsonl > "$output_file"
    puzzle_count=$(wc -l < "$output_file")
    echo "📁 Created $output_file ($puzzle_count puzzles)"
done

# Create combined file
cat test_puzzles_4x4.jsonl test_puzzles_5x5.jsonl test_puzzles_6x6.jsonl test_puzzles_7x7.jsonl > test_all_puzzles.jsonl
total_puzzles=$(wc -l < test_all_puzzles.jsonl)

# Clean up intermediate files
rm -rf test_parallel_output

end_time=$(date +%s)
duration=$((end_time - start_time))

echo "📁 Created test_all_puzzles.jsonl ($total_puzzles total puzzles)"
echo ""
echo "🎉 TEST generation complete!"
echo "📈 Performance summary:"
echo "   - Used 4 parallel processes"
echo "   - Generated $total_puzzles puzzles total"
echo "   - Time taken: ${duration} seconds"
echo "   - Files: test_puzzles_4x4.jsonl, test_puzzles_5x5.jsonl, test_puzzles_6x6.jsonl, test_puzzles_7x7.jsonl, test_all_puzzles.jsonl"

# Quick analysis
echo ""
echo "🔍 Quick analysis:"
python inspect_puzzles.py --batch-file test_all_puzzles.jsonl 