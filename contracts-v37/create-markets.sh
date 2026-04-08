#!/bin/bash

# Create 7 real prediction markets (one for each category)
# Duration: 7 days betting + 3 days resolution = 10 days total
# Current block: ~14067000
# Betting deadline: 14107191 (7 days)
# Resolution deadline: 14124471 (10 days)

echo "🎯 Creating 7 Real Prediction Markets..."
echo ""

# Category 1: Politics
echo "1️⃣ POLITICS: Will Trump complete his full presidential term through 2028?"
leo execute create_market "10001field" "1u8" "14107191u64" "14124471u64" --broadcast
echo ""
sleep 5

# Category 2: Sports  
echo "2️⃣ SPORTS: Will Lionel Messi win the 2026 FIFA World Cup with Argentina?"
leo execute create_market "20002field" "2u8" "14107191u64" "14124471u64" --broadcast
echo ""
sleep 5

# Category 3: Crypto
echo "3️⃣ CRYPTO: Will Bitcoin reach $150,000 by end of Q1 2026?"
leo execute create_market "30003field" "3u8" "14107191u64" "14124471u64" --broadcast
echo ""
sleep 5

# Category 4: Entertainment
echo "4️⃣ ENTERTAINMENT: Will Avatar 3 gross over $2 billion worldwide in 2026?"
leo execute create_market "40004field" "4u8" "14107191u64" "14124471u64" --broadcast
echo ""
sleep 5

# Category 5: Tech
echo "5️⃣ TECH: Will Apple release AR glasses (Apple Vision Pro 2) in 2026?"
leo execute create_market "50005field" "5u8" "14107191u64" "14124471u64" --broadcast
echo ""
sleep 5

# Category 6: Economics
echo "6️⃣ ECONOMICS: Will global inflation drop below 3% average by end of 2026?"
leo execute create_market "60006field" "6u8" "14107191u64" "14124471u64" --broadcast
echo ""
sleep 5

# Category 7: Science
echo "7️⃣ SCIENCE: Will NASA Artemis III successfully land humans on Moon in 2026?"
leo execute create_market "70007field" "7u8" "14107191u64" "14124471u64" --broadcast
echo ""

echo "✅ All 7 markets created successfully!"
echo ""
echo "📊 Market Details:"
echo "- Betting Period: 7 days (until block 14107191)"
echo "- Resolution Period: 3 days (until block 14124471)"
echo "- Total Duration: 10 days"
echo ""
echo "📝 Question Hash Mapping:"
echo "10001field = Will Trump complete his full presidential term through 2028?"
echo "20002field = Will Lionel Messi win the 2026 FIFA World Cup with Argentina?"
echo "30003field = Will Bitcoin reach \$150,000 by end of Q1 2026?"
echo "40004field = Will Avatar 3 gross over \$2 billion worldwide in 2026?"
echo "50005field = Will Apple release AR glasses (Apple Vision Pro 2) in 2026?"
echo "60006field = Will global inflation drop below 3% average by end of 2026?"
echo "70007field = Will NASA Artemis III successfully land humans on Moon in 2026?"
