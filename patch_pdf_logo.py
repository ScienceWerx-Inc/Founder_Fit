import re

with open('src/app/page.tsx', 'r') as f:
    content = f.read()

# Replace Logo
logo_search = """/* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, verticalAlign: "super" } }, "\u2122"))"""
logo_replace = """/* @__PURE__ */ React.createElement("button", { onClick: () => setStep("intro"), style: { background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex', alignItems: 'center' } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, verticalAlign: "super" } }, "\u2122")))"""
if logo_search in content:
    content = content.replace(logo_search, logo_replace)
    print("Logo replaced")
else:
    print("Logo search string not found")

# Add Save PDF button
# Currently: step !== "intro" && /* @__PURE__ */ React.createElement("div", { style: { display: 'flex', gap: '8px' } }, /* @__PURE__ */ React.createElement("button", { onClick: handleBack, ... }), step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill ... }))
# We will use regex to find the button block and append the Save PDF button

search_str = """step !== "intro" && /* @__PURE__ */ React.createElement("div", { style: { display: 'flex', gap: '8px' } }, /* @__PURE__ */ React.createElement("button", { onClick: handleBack, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "\u2190 Back"), step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "auto-fill sample \u2192"))"""

replace_str = """step !== "intro" && /* @__PURE__ */ React.createElement("div", { className: "no-print", style: { display: 'flex', gap: '8px' } }, /* @__PURE__ */ React.createElement("button", { onClick: handleBack, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "\u2190 Back"), step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "auto-fill sample \u2192"), step === "results" && /* @__PURE__ */ React.createElement("button", { onClick: () => window.print(), style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.ink, background: T.accentSoft, border: `1px solid ${T.accent}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", display: 'flex', alignItems: 'center', gap: '4px' } }, "\u2193 Save PDF"))"""

if search_str in content:
    content = content.replace(search_str, replace_str)
    print("Buttons replaced")
else:
    print("Buttons search string not found")

with open('src/app/page.tsx', 'w') as f:
    f.write(content)

