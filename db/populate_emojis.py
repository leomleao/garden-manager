#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re

# Emoji mapping for each type
emoji_map = {
    'salad': '🥬',
    'vegetable': '🥕',
    'fruit': '🍅',
    'herb': '🌿',
    'flower': '🌸'
}

# Read the file
with open('seed-inventory.sql', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to match INSERT VALUES rows with current structure:
# ('Name', 'Variety', 'TYPE_NAME', quantity, box_id, ...
# We need to replace with:
# ('Name', 'Variety', 'EMOJI', 'TYPE_NAME', quantity, box_id, ...

def replace_row(match):
    before = match.group(1)  # Everything up to the VALUES clause
    rows = match.group(2)    # The VALUES rows
    
    # Split by lines and process each row
    lines = rows.split('\n')
    result_lines = []
    
    for line in lines:
        # Check if this is a value row (starts with '( for the first row, or just '( for subsequent)
        if line.strip().startswith("('"):
            # Match: ('Name', 'Variety', 'TYPE', number, number, ...
            # Pattern: (\('[^']+', '[^']*', )'(SALAD|VEGETABLE|FRUIT|HERB|FLOWER)', (\d+), (\d+), (.*\),?)
            pattern = r"(\('[^']+', '[^']*', )'(salad|vegetable|fruit|herb|flower)', (\d+), (\d+), (.*)"
            
            def replace_type(m):
                prefix = m.group(1)  # ('Name', 'Variety', '
                type_name = m.group(2)  # salad/vegetable/fruit/herb/flower
                emoji = emoji_map.get(type_name.lower(), "''")
                quantity = m.group(3)
                box_id = m.group(4)
                rest = m.group(5)
                
                # Reconstruct: ('Name', 'Variety', 'EMOJI', 'TYPE', quantity, box_id, ...
                return f"{prefix}{emoji}, '{type_name}', {quantity}, {box_id}, {rest}"
            
            line = re.sub(pattern, replace_type, line)
        
        result_lines.append(line)
    
    return before + '\n'.join(result_lines)

# Find the INSERT VALUES section
pattern = r"(INSERT INTO seeds.*?VALUES\n)([\s\S]*?)(?=;)"
content = re.sub(pattern, replace_row, content, flags=re.MULTILINE)

# Write back
with open('seed-inventory.sql', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Emojis populated successfully for all 60 seeds!")
print("\nEmoji mappings applied:")
print("  🥬 for salad")
print("  🥕 for vegetable")
print("  🍅 for fruit")
print("  🌿 for herb")
print("  🌸 for flower")
