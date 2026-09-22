import re

with open('src/app/layout.tsx', 'r') as f:
    content = f.read()

# Add the import
import_statement = "import { Analytics } from '@vercel/analytics/react';\n"
content = import_statement + content

# Add the component inside the body
body_end = "      </body>"
content = content.replace(body_end, "        <Analytics />\n      </body>")

with open('src/app/layout.tsx', 'w') as f:
    f.write(content)
