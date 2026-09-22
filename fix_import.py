import re

with open('src/app/page.tsx', 'r') as f:
    content = f.read()

# Remove the import line from the top
content = content.replace("import { saveAssessment } from './actions';\n", "")

# Insert it after 'use client';
content = content.replace("'use client';\n", "'use client';\nimport { saveAssessment } from './actions';\n")

with open('src/app/page.tsx', 'w') as f:
    f.write(content)
