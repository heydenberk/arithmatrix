#!/bin/bash

# Parallel KenKen puzzle generation script
# Generates 1000 puzzles per size (4,5,6,7) using parallel batches of 100

set -e  # Exit on error

# Create output directory
mkdir -p parallel_output

# Initialize progress tracking
echo "0" > parallel_output/completed_batches.txt
echo "0" > parallel_output/completed_4x4.txt
echo "0" > parallel_output/completed_5x5.txt
echo "0" > parallel_output/completed_6x6.txt
echo "0" > parallel_output/completed_7x7.txt

# Function to generate a batch
generate_batch() {
    local size=$1
    local batch_num=$2
    local config_file="parallel_output/config_${size}_${batch_num}.json"
    local output_file="parallel_output/batch_${size}_${batch_num}.jsonl"
    
    # Create config for 100 puzzles of this size
    echo "{\"$size\": 100}" > "$config_file"
    
    # Generate the batch
    echo "Starting batch $batch_num for size ${size}x${size}..."
    python batch_puzzle_generator.py --config custom --custom-config "$config_file" --output-file "$output_file" 2>/dev/null
    
    # Clean up config file
    rm "$config_file"
    
    # Update progress counters atomically
    (
        flock -x 200
        total_completed=$(cat parallel_output/completed_batches.txt)
        size_completed=$(cat parallel_output/completed_${size}x${size}.txt)
        echo $((total_completed + 1)) > parallel_output/completed_batches.txt
        echo $((size_completed + 1)) > parallel_output/completed_${size}x${size}.txt
    ) 200>parallel_output/progress.lock
    
    echo "✅ Completed batch $batch_num for size ${size}x${size}"
}

# Function to monitor progress
monitor_progress() {
    local start_time=$1
    while [ $(cat parallel_output/completed_batches.txt 2>/dev/null || echo 0) -lt 40 ]; do
        sleep 10
        if [ -f parallel_output/completed_batches.txt ]; then
            local completed=$(cat parallel_output/completed_batches.txt)
            local completed_4x4=$(cat parallel_output/completed_4x4.txt)
            local completed_5x5=$(cat parallel_output/completed_5x5.txt)
            local completed_6x6=$(cat parallel_output/completed_6x6.txt)
            local completed_7x7=$(cat parallel_output/completed_7x7.txt)
            local elapsed=$(($(date +%s) - start_time))
            local mins=$((elapsed / 60))
            local secs=$((elapsed % 60))
            
            printf "\r📊 Progress: %d/40 batches | 4x4: %d/10 | 5x5: %d/10 | 6x6: %d/10 | 7x7: %d/10 | Time: %dm%02ds" \
                $completed $completed_4x4 $completed_5x5 $completed_6x6 $completed_7x7 $mins $secs
            
            if [ $completed -gt 0 ]; then
                local avg_time_per_batch=$((elapsed / completed))
                local remaining_batches=$((40 - completed))
                local eta_seconds=$((remaining_batches * avg_time_per_batch))
                local eta_mins=$((eta_seconds / 60))
                printf " | ETA: %dm" $eta_mins
            fi
        fi
    done
    echo ""  # New line after progress updates
}

# Export function so xargs can use it
export -f generate_batch

echo "🧩 Starting parallel KenKen generation..."
echo "📊 Target: 1000 puzzles each of sizes 4x4, 5x5, 6x6, 7x7"
echo "⚡ Method: 10 parallel batches of 100 puzzles per size (16 processes)"
echo ""

# Record start time
start_time=$(date +%s)

# Start progress monitor in background
monitor_progress $start_time &
monitor_pid=$!

# Create list of all size/batch combinations
{
    for size in 4 5 6 7; do
        for batch in {1..10}; do
            echo "$size $batch"
        done
    done
} | xargs -n 2 -P 16 bash -c 'generate_batch "$@"' _

# Stop progress monitor
kill $monitor_pid 2>/dev/null || true
wait $monitor_pid 2>/dev/null || true

echo ""
echo "✅ All batches completed! Combining files..."

# Calculate final timing
end_time=$(date +%s)
total_duration=$((end_time - start_time))
total_mins=$((total_duration / 60))
total_secs=$((total_duration % 60))

# Combine all files by size
for size in 4 5 6 7; do
    output_file="puzzles_${size}x${size}.jsonl"
    cat parallel_output/batch_${size}_*.jsonl > "$output_file"
    echo "📁 Created $output_file ($(wc -l < "$output_file") puzzles)"
done

# Create combined file
cat puzzles_4x4.jsonl puzzles_5x5.jsonl puzzles_6x6.jsonl puzzles_7x7.jsonl > all_puzzles.jsonl
echo "📁 Created all_puzzles.jsonl ($(wc -l < all_puzzles.jsonl) total puzzles)"

# Clean up intermediate files
rm -rf parallel_output

echo ""
echo "🎉 Generation complete!"
echo "📈 Performance summary:"
echo "   - Used 16 parallel processes"
echo "   - Generated $(wc -l < all_puzzles.jsonl) puzzles total"
echo "   - Total time: ${total_mins}m${total_secs}s"
echo "   - Average time per puzzle: $(echo "scale=2; $total_duration / $(wc -l < all_puzzles.jsonl)" | bc -l)s"
echo "   - Files: puzzles_4x4.jsonl, puzzles_5x5.jsonl, puzzles_6x6.jsonl, puzzles_7x7.jsonl, all_puzzles.jsonl" 