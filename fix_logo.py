import re

with open('src/app/page.tsx', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'const shell = (children, { wide } = {}) => /* @__PURE__ */ React.createElement("div"' in line:
        
        # Replace the button with an anchor tag for a hard refresh
        replacement = """    const shell = (children, { wide } = {}) => /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: "'IBM Plex Sans', sans-serif" } }, /* @__PURE__ */ React.createElement("div", { className: "no-print", style: { borderBottom: `1px solid ${T.line}`, background: T.surface } }, /* @__PURE__ */ React.createElement("div", { className: "shell-header no-print", style: { maxWidth: wide ? 1060 : 760, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 10 } }, /* @__PURE__ */ React.createElement("a", { href: "/", style: { textDecoration: "none", color: "inherit", display: "flex", alignItems: "baseline" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, verticalAlign: "super" } }, "\u2122"))), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut } }, "ScienceWerx \xB7 algo ", VERSIONS.algo_version, " \xB7 content ", VERSIONS.content_version)), step !== "intro" && /* @__PURE__ */ React.createElement("div", { style: { display: 'flex', gap: '8px' } }, /* @__PURE__ */ React.createElement("button", { onClick: handleBack, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "\u2190 Back"), step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "auto-fill sample \u2192"), step === "results" && /* @__PURE__ */ React.createElement("button", { onClick: () => window.print(), style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.ink, background: T.accentSoft, border: `1px solid ${T.accent}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "\u2193 Save PDF")))), /* @__PURE__ */ React.createElement("div", { className: "shell-container", style: { maxWidth: wide ? 1060 : 760, margin: "0 auto", padding: "36px 20px 80px" } }, children));\n"""
        
        lines[i] = replacement
        break

with open('src/app/page.tsx', 'w') as f:
    f.writelines(lines)
    print("Fixed logo!")
