import re

with open('src/app/page.tsx', 'r') as f:
    content = f.read()

# Add import at the top
import_statement = "import { saveAssessment } from './actions';\n"
content = import_statement + content

# Replace `setStep("results");` in finish
finish_search = """      setOutput(out);
      setNarrative(null);
      setNarrError(null);
      setStep("results");"""

finish_replace = """      setOutput(out);
      setNarrative(null);
      setNarrError(null);
      setStep("results");
      
      // Save to database
      saveAssessment(candidateName, asset.name, out.result.ffi, out.result.band, out).then(res => {
        if (res.success) {
          console.log("Saved assessment to DB with ID:", res.id);
        } else {
          console.error("Error saving assessment:", res.error);
        }
      });"""

if finish_search in content:
    content = content.replace(finish_search, finish_replace)
    with open('src/app/page.tsx', 'w') as f:
        f.write(content)
    print("Patched finish function successfully")
else:
    print("Could not find finish block")
