#!/usr/bin/env python
import re

with open('seed-inventory.sql', 'r', encoding='utf-8') as f:
    content = f.read()

# Map types to emojis (using Unicode escapes)
emoji_map = {
    "'herb'": r"'\u{1F33F}'",
    "'vegetable'": r"'\u{1F955}'",
    "'flower'": r"'\u{1F338}'",
    "'salad'": r"'\u{1F96C}'",
    "'fruit'": r"'\u{1F345}'"
}

# Process each row to add emoji
# Pattern: (name, variety, then we need to insert emoji before type
# Looking for: ('Name', 'Variety', 'type',
pattern = r"(\('[^']+', '[^']*', )('(?:herb|vegetable|flower|salad|fruit)'),"

def replace_with_emoji(match):
    prefix = match.group(1)
    type_str = match.group(2)
    emoji = emoji_map.get(type_str, "''")
    return f"{prefix}{emoji}, {type_str},"

content = re.sub(pattern, replace_with_emoji, content)

with open('seed-inventory.sql', 'w', encoding='utf-8') as f:
    f.write(content)

print('Emojis added to all seed rows')
