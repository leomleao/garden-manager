#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re

# Read the file
with open('seed-inventory.sql', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find unquoted emojis and quote them
# Match: , 🥬, ' or , 🥕, ' etc.
pattern = r', (🥬|🥕|🍅|🌿|🌸), \''
replacement = r", '\1', '"

content = re.sub(pattern, replacement, content)

# Write back
with open('seed-inventory.sql', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Emojis properly quoted in SQL!")
