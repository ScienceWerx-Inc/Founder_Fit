import re

with open('src/app/page.tsx', 'r') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if 'if (step === "intro") {' in line:
        start_idx = i
    if start_idx != -1 and 'if (step === "asset") {' in line:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    replacement = """    if (step === "intro") {
      return /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: "'IBM Plex Sans', sans-serif", display: "flex", flexDirection: "column" } }, 
        /* @__PURE__ */ React.createElement("div", { className: "shell-header", style: { padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.line}`, background: T.surface } },
          /* @__PURE__ */ React.createElement("a", { href: "/", style: { textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 12 } },
             /* @__PURE__ */ React.createElement("svg", { width: "32", height: "32", viewBox: "0 0 32 32", fill: "none", xmlns: "http://www.w3.org/2000/svg" }, 
                /* @__PURE__ */ React.createElement("rect", { width: "32", height: "32", rx: "8", fill: "#1C2321" }),
                /* @__PURE__ */ React.createElement("path", { d: "M10 22V10L16 16L22 10V22", stroke: "#F5F6F2", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }),
                /* @__PURE__ */ React.createElement("circle", { cx: "16", cy: "8", r: "2", fill: "#C55233" })
             ),
             /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, verticalAlign: "super", color: T.mut, marginLeft: 4 } }, "\u2122"))
          ),
          /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: T.mut } }, "ScienceWerx")
        ),
        /* @__PURE__ */ React.createElement("main", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", textAlign: "center" } },
          /* @__PURE__ */ React.createElement("div", { style: { display: "inline-block", padding: "6px 14px", border: `1px solid ${T.accent}40`, borderRadius: 20, color: T.accent, fontWeight: 600, fontSize: 13, marginBottom: 24, fontFamily: "'IBM Plex Mono', monospace" } }, "v2.0 \u2014 Two-Sided Matching Engine"),
          /* @__PURE__ */ React.createElement("h1", { style: { fontSize: "clamp(36px, 5vw, 64px)", lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.03em", maxWidth: 900, marginBottom: 24 } }, "Not \u201Cis this person a founder?\u201D", /* @__PURE__ */ React.createElement("br", null), "But \u201Cis this the founder for ", /* @__PURE__ */ React.createElement("span", { style: { color: T.accent } }, "this"), " asset?\u201D"),
          /* @__PURE__ */ React.createElement("p", { style: { fontSize: "clamp(16px, 2vw, 22px)", lineHeight: 1.6, color: T.mut, maxWidth: 700, marginBottom: 60 } }, "This assessment rigorously evaluates candidates against a specific, already-validated technology asset to identify true structural fit, capabilities, and adjacency."),
          
          /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, maxWidth: 1060, width: "100%", marginBottom: 60, textAlign: "left" } },
            [
              ["01", "Disposition", "Stable traits designed around, never trained. 18 timed scenarios."],
              ["02", "Capability", "Learnable competencies closing in 90-180 days. 16 situational judgments."],
              ["03", "Adjacency", "Assessor-rated position relative to this asset's specific demands."]
            ].map(([num, title, desc]) => 
              /* @__PURE__ */ React.createElement("div", { key: num, style: { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.03)" } },
                 /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", color: T.accent, fontWeight: 600, fontSize: 14, marginBottom: 12 } }, num),
                 /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 22, fontWeight: 700, marginBottom: 8 } }, title),
                 /* @__PURE__ */ React.createElement("p", { style: { fontSize: 15, color: T.mut, lineHeight: 1.6 } }, desc)
              )
            )
          ),
          
          /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "center" } },
            /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("asset"), style: { background: T.ink, color: "#fff", padding: "16px 40px", fontSize: 18, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" } }, "Begin Assessment"),
            /* @__PURE__ */ React.createElement("button", { onClick: autofill, style: { background: "none", color: T.ink, padding: "16px 40px", fontSize: 18, fontWeight: 500, borderRadius: 8, cursor: "pointer", border: `2px solid ${T.lineDark}` } }, "Run Sample Candidate")
          )
        )
      );\n    }\n"""
    
    new_lines = lines[:start_idx] + [replacement] + lines[end_idx:]
    with open('src/app/page.tsx', 'w') as f:
        f.writelines(new_lines)
    print("Patched intro landing page perfectly.")
else:
    print("Could not find intro block boundaries.")

