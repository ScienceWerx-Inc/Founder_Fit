import re

with open('src/app/page.tsx', 'r') as f:
    content = f.read()

logo_old = """/* @__PURE__ */ React.createElement("a", { href: "/", style: { textDecoration: "none", color: "inherit", display: "flex", alignItems: "baseline" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, verticalAlign: "super" } }, "\u2122")))"""
logo_new = """/* @__PURE__ */ React.createElement("a", { href: "/", style: { textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("svg", { width: "24", height: "24", viewBox: "0 0 32 32", fill: "none", xmlns: "http://www.w3.org/2000/svg" }, /* @__PURE__ */ React.createElement("rect", { width: "32", height: "32", rx: "8", fill: "#1C2321" }), /* @__PURE__ */ React.createElement("path", { d: "M10 22V10L16 16L22 10V22", stroke: "#F5F6F2", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "16", cy: "8", r: "2", fill: "#C55233" })), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, verticalAlign: "super", color: T.mut, marginLeft: 2 } }, "\u2122")))"""

content = content.replace(logo_old, logo_new)

intro_old_search = """    if (step === "intro") {
      return shell(
        /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Ticks, null), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Two-sided founder\u2013asset matching"), /* @__PURE__ */ React.createElement("h1", { style: { fontSize: 40, lineHeight: 1.12, fontWeight: 700, letterSpacing: "-0.02em", margin: "14px 0 18px", maxWidth: 640 } }, "Not ", /* @__PURE__ */ React.createElement("em", { style: { fontStyle: "italic", color: T.accent } }, "\u201Cis this person a founder?\u201D"), /* @__PURE__ */ React.createElement("br", null), "but ", /* @__PURE__ */ React.createElement("em", { style: { fontStyle: "italic", color: T.accent } }, "\u201Cis this person the founder for this technology?\u201D")), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 16, lineHeight: 1.65, color: T.mut, maxWidth: 620 } }, "This assessment evaluates a candidate against a specific, already-validated technology asset \u2014 one they did not invent and do not own. The asset's profile determines what the venture demands; the candidate is measured against that demand, not against a general standard. The output identifies talents, development priorities, structural considerations, and \u2014 when it is the honest answer \u2014 misfit for the anchor role."), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, margin: "30px 0" } }, [
          ["01 \xB7 Disposition", "18 timed questions, 60 seconds each. Pick the statement most and least like you. Stable traits \u2014 designed around, never trained."],
          ["02 \xB7 Capability", "16 timed situational judgments. Learnable competencies that close in 90\u2013180 days with support."],
          ["03 \xB7 Adjacency", "Assessor-rated position relative to this asset: standing, access, experience, conviction, capacity."]
        ].map(([t, d]) => /* @__PURE__ */ React.createElement("div", { key: t, style: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: 18 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, marginBottom: 8 } }, t), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, lineHeight: 1.55, color: T.mut } }, d)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Btn, { kind: "accent", onClick: () => setStep("asset") }, "Begin assessment"), /* @__PURE__ */ React.createElement(Btn, { kind: "ghost", onClick: autofill }, "Run sample candidate")), /* @__PURE__ */ React.createElement("p", { style: { marginTop: 26, fontSize: 12, color: T.mut, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6 } }, "Prototype note: scoring runs in-browser here for demonstration. Production scoring is server-side only, per the build contract.")))
      );
    }"""

intro_new = """    if (step === "intro") {
      return /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: "'IBM Plex Sans', sans-serif", display: "flex", flexDirection: "column" } }, 
        /* @__PURE__ */ React.createElement("div", { className: "shell-header", style: { padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.line}`, background: T.surface } },
          /* @__PURE__ */ React.createElement("a", { href: "/", style: { textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 12 } },
             /* @__PURE__ */ React.createElement("svg", { width: "32", height: "32", viewBox: "0 0 32 32", fill: "none", xmlns: "http://www.w3.org/2000/svg" }, 
                /* @__PURE__ */ React.createElement("rect", { width: "32", height: "32", rx: "8", fill: "#1C2321" }),
                /* @__PURE__ */ React.createElement("path", { d: "M10 22V10L16 16L22 10V22", stroke: "#F5F6F2", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }),
                /* @__PURE__ */ React.createElement("circle", { cx: "16", cy: "8", r: "2", fill: "#C55233" })
             ),
             /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, verticalAlign: "super", color: T.mut, marginLeft: 2 } }, "\u2122"))
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
      );
    }"""

if intro_old_search in content:
    content = content.replace(intro_old_search, intro_new)
    print("Replaced landing page.")
else:
    print("Failed to find landing page block!")

with open('src/app/page.tsx', 'w') as f:
    f.write(content)

