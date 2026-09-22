import re

with open('src/app/page.tsx', 'r') as f:
    content = f.read()

# Replace the logo with a clickable button
logo_search = """/* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, verticalAlign: "super" } }, "\u2122"))"""
logo_replace = """/* @__PURE__ */ React.createElement("button", { onClick: () => setStep("intro"), style: { background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, verticalAlign: "super" } }, "\u2122")))"""

content = content.replace(logo_search, logo_replace)

# Replace shell layout to include classes and the PDF button
shell_header_search = """/* @__PURE__ */ React.createElement("div", { style: { maxWidth: wide ? 1060 : 760, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" } }"""
shell_header_replace = """/* @__PURE__ */ React.createElement("div", { className: "shell-header", style: { maxWidth: wide ? 1060 : 760, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" } }"""
content = content.replace(shell_header_search, shell_header_replace)

shell_container_search = """/* @__PURE__ */ React.createElement("div", { style: { maxWidth: wide ? 1060 : 760, margin: "0 auto", padding: "36px 20px 80px" } }"""
shell_container_replace = """/* @__PURE__ */ React.createElement("div", { className: "shell-container", style: { maxWidth: wide ? 1060 : 760, margin: "0 auto", padding: "36px 20px 80px" } }"""
content = content.replace(shell_container_search, shell_container_replace)

buttons_search = """step !== "intro" && /* @__PURE__ */ React.createElement("div", { style: { display: 'flex', gap: '8px' } }, /* @__PURE__ */ React.createElement("button", { onClick: handleBack, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "\u2190 Back"), step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "auto-fill sample \u2192"))"""
buttons_replace = """step !== "intro" && /* @__PURE__ */ React.createElement("div", { className: "no-print", style: { display: 'flex', gap: '8px' } }, /* @__PURE__ */ React.createElement("button", { onClick: handleBack, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "\u2190 Back"), step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "auto-fill sample \u2192"), step === "results" && /* @__PURE__ */ React.createElement("button", { onClick: () => window.print(), style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.ink, background: T.accentSoft, border: `1px solid ${T.accent}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "\u2193 Save PDF"))"""
content = content.replace(buttons_search, buttons_replace)

with open('src/app/page.tsx', 'w') as f:
    f.write(content)
print("Shell patched successfully")
