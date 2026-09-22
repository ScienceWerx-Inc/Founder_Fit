import re

with open('src/app/page.tsx', 'r') as f:
    content = f.read()

# We want to insert a handleBack function before `const shell = ...`
handle_back_code = """
    const handleBack = () => {
      if (step === "asset") setStep("intro");
      else if (step === "context") setStep("asset");
      else if (step === "fc") {
        if (idx > 0) setIdx(idx - 1);
        else setStep("context");
      }
      else if (step === "scen") {
        if (idx > 0) setIdx(idx - 1);
        else { setStep("fc"); setIdx(FC_BLOCKS.length - 1); }
      }
      else if (step === "calib") {
        if (idx > 0) setIdx(idx - 1);
        else { setStep("scen"); setIdx(SCENARIOS.length - 1); }
      }
      else if (step === "adjacency") {
        setStep("calib"); setIdx(CALIBRATION.length - 1);
      }
      else if (step === "results") setStep("adjacency");
    };
"""

# Find `const shell = `
shell_idx = content.find("const shell = (children")
if shell_idx != -1:
    content = content[:shell_idx] + handle_back_code + content[shell_idx:]
else:
    print("Could not find shell")
    exit(1)

# Now we want to add the back button in the shell header.
# Currently: `step !== "intro" && step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill ... }`
# We can just replace the `autofill` button wrapper with a Fragment containing both `Back` and `autofill`.

find_str = """step !== "intro" && step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "auto-fill sample \u2192")"""

replace_str = """step !== "intro" && /* @__PURE__ */ React.createElement("div", { style: { display: 'flex', gap: '8px' } }, 
  /* @__PURE__ */ React.createElement("button", { onClick: handleBack, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "\u2190 Back"),
  step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "auto-fill sample \u2192")
)"""

if find_str in content:
    content = content.replace(find_str, replace_str)
    with open('src/app/page.tsx', 'w') as f:
        f.write(content)
    print("Patched successfully.")
else:
    print("Could not find button code")
    exit(1)

