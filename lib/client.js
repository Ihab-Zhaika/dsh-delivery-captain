window.__ModuleLoader__.load({
	id: "@ihab-zhaika/dsh-delivery-captain",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region \0dsh-css:C:\Projects\dark-dsh-harness\src\client\CaptainPanel.module.css.mjs
		const css = ".H3D8Ca_entry{border:1px solid var(--dsw-alias-border-l2,#354151);background:var(--dsw-alias-bg-module-platform,#17202c);color:var(--dsw-alias-label-primary,#e8eff7);font:inherit;cursor:pointer;border-radius:8px;align-items:center;gap:7px;padding:6px 10px;font-size:12px;display:inline-flex}.H3D8Ca_entry>span{color:#77ddc2;font-size:20px;line-height:12px}.H3D8Ca_backdrop{z-index:1200;backdrop-filter:blur(7px);pointer-events:auto;background:#050910b8;place-items:center;padding:24px;display:grid;position:fixed;inset:0}.H3D8Ca_panel{--cap-border:#293443;--cap-muted:#94a3b5;box-sizing:border-box;color:#e8edf5;color-scheme:dark;background:#101722;border:1px solid #3a485b;border-radius:18px;flex-direction:column;width:min(1500px,100%);height:min(960px,100dvh - 48px);min-height:0;font:13px/1.5 system-ui,sans-serif;display:flex;overflow:hidden;box-shadow:0 32px 100px #0009}.H3D8Ca_panel *,.H3D8Ca_panel :before,.H3D8Ca_panel :after{box-sizing:border-box}.H3D8Ca_panel h1,.H3D8Ca_panel h2,.H3D8Ca_panel h3,.H3D8Ca_panel p{margin:0}.H3D8Ca_panel h1{letter-spacing:-.6px;font-size:23px;font-weight:650;line-height:1.25}.H3D8Ca_panel h2{font-size:14px;font-weight:650}.H3D8Ca_panel h3{font-size:17px;font-weight:550}.H3D8Ca_panel button,.H3D8Ca_panel input,.H3D8Ca_panel select,.H3D8Ca_panel textarea{font:inherit}.H3D8Ca_panel button{color:#dfe8f3;cursor:pointer;background:#1c2736;border:1px solid #374456;border-radius:7px;padding:6px 11px;transition:background .12s,border-color .12s}.H3D8Ca_panel button:hover:not(:disabled),.H3D8Ca_entry:hover{background:#28394b;border-color:#6c8b9c}.H3D8Ca_panel button:disabled{opacity:.4;cursor:not-allowed}.H3D8Ca_panel :is(button,input,select,textarea,summary,a):focus-visible,.H3D8Ca_entry:focus-visible{outline-offset:3px;outline:2px solid #7ce0c3}.H3D8Ca_panel a{color:#83d7ff;text-decoration:none}.H3D8Ca_panel a:hover{text-decoration:underline}.H3D8Ca_panel code{overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:11px}.H3D8Ca_header{border-bottom:1px solid var(--cap-border);background:linear-gradient(115deg,#182936,#141c2b 60%);justify-content:space-between;align-items:center;gap:12px;padding:19px 24px 16px;display:flex}.H3D8Ca_heading{align-items:center;gap:14px;display:flex}.H3D8Ca_mark{color:#8af2d3;background:#1d423c;border:1px solid #387963;border-radius:12px;place-items:center;width:44px;height:44px;font-size:36px;line-height:1;display:grid}.H3D8Ca_eyebrow{letter-spacing:2.2px;color:#84beaf;font-size:9px;font-weight:650}.H3D8Ca_owner{color:var(--cap-muted);border-bottom:1px solid var(--cap-border);align-items:center;gap:8px;padding:8px 24px;font-size:11px;display:flex}.H3D8Ca_owner>span{margin-left:auto}.H3D8Ca_body{flex:1;grid-template-columns:300px minmax(0,1fr);min-height:0;display:grid}.H3D8Ca_configuration{border-right:1px solid var(--cap-border);background:#131c28;padding:20px;overflow-y:auto}.H3D8Ca_sectionTitle{justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px;display:flex}.H3D8Ca_sectionTitle>span{color:var(--cap-muted);text-align:right;font-size:10px}.H3D8Ca_configuration .H3D8Ca_sectionTitle{flex-direction:column;align-items:start;gap:2px}.H3D8Ca_fields{border:0;flex-direction:column;gap:13px;min-width:0;margin:0;padding:0;display:flex}.H3D8Ca_fields label{color:#bcc9d9;flex-direction:column;gap:5px;font-size:11px;display:flex}.H3D8Ca_fields input,.H3D8Ca_fields select,.H3D8Ca_fields textarea,.H3D8Ca_controls input{color:#e6edf6;background:#0c1420;border:1px solid #344153;border-radius:6px;width:100%;min-width:0;padding:8px 9px}.H3D8Ca_fields textarea{resize:vertical;min-height:50px;line-height:1.6}.H3D8Ca_fields input:disabled,.H3D8Ca_fields textarea:disabled,.H3D8Ca_fields select:disabled{opacity:.65}.H3D8Ca_fields small,.H3D8Ca_optional{color:#7c8ca2;font-size:10px}.H3D8Ca_fields .H3D8Ca_check{flex-direction:row;align-items:center;gap:8px}.H3D8Ca_check input{accent-color:#7ce0c3;width:15px;height:15px}.H3D8Ca_pair{grid-template-columns:1fr 1fr;gap:10px;display:grid}.H3D8Ca_fields summary{cursor:pointer;color:#afd5cd;padding:8px 0;font-size:11px}.H3D8Ca_authorization{color:#a6b9c4;background:#1d2b32;border-left:2px solid #619c8e;border-radius:3px;padding:11px;font-size:10px;line-height:1.7;margin:17px 0 11px!important}.H3D8Ca_panel .H3D8Ca_primary{color:#0e3029;background:#88dec4;border-color:#80d5bb;width:100%;padding:10px;font-weight:700}.H3D8Ca_panel .H3D8Ca_primary:hover:not(:disabled){background:#a5efd9}.H3D8Ca_monitor{min-width:0;padding:20px 24px;overflow-y:auto}.H3D8Ca_metrics{border:1px solid var(--cap-border);background:#151f2c;border-radius:10px;grid-template-columns:repeat(4,minmax(0,1fr));display:grid;overflow:hidden}.H3D8Ca_metrics>div{border-right:1px solid var(--cap-border);flex-direction:column;gap:4px;padding:16px;display:flex}.H3D8Ca_metrics>div:last-child{border:0}.H3D8Ca_metrics span{color:#a6b6c9;font-size:10px}.H3D8Ca_metrics strong{letter-spacing:-.6px;font-variant-numeric:tabular-nums;font-size:26px;font-weight:550}.H3D8Ca_metrics em{color:#647b8b;font-size:16px;font-style:normal}.H3D8Ca_metrics small{color:#6e829a;font-size:10px}.H3D8Ca_metrics .H3D8Ca_unmeasured{letter-spacing:0;color:#8095a9;font-size:15px;line-height:39px}.H3D8Ca_controls{flex-wrap:wrap;align-items:center;gap:7px;margin-top:17px;display:flex}.H3D8Ca_controls label{color:#9bafc4;align-items:center;gap:7px;margin-left:auto;font-size:11px;display:flex}.H3D8Ca_controls input{width:56px;padding:6px}.H3D8Ca_panel .H3D8Ca_danger{color:#eca49d;border-color:#67403e}.H3D8Ca_controlHint{color:#778a9f;font-size:10px;margin:8px 0 19px!important}.H3D8Ca_card{border:1px solid var(--cap-border);background:#131d2a;border-radius:10px;min-width:0;margin-bottom:16px;padding:16px}.H3D8Ca_tableScroll{margin:0 -16px;overflow-x:auto}.H3D8Ca_panel table{border-collapse:collapse;text-align:left;width:100%;font-size:11px}.H3D8Ca_panel th{color:#72879e;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid var(--cap-border);white-space:nowrap;padding:9px 10px;font-size:9px;font-weight:600}.H3D8Ca_panel td{vertical-align:top;border-bottom:1px solid #223041;padding:12px 10px}.H3D8Ca_panel td:first-child,.H3D8Ca_panel th:first-child{padding-left:16px}.H3D8Ca_panel tbody tr:last-child td{border-bottom:0}.H3D8Ca_panel tr[data-selected=true]{background:#1d303b}.H3D8Ca_panel .H3D8Ca_taskButton{text-align:left;background:0 0;border:0;flex-direction:column;gap:3px;min-width:155px;padding:0;display:flex}.H3D8Ca_taskButton code{color:#83d9c1}.H3D8Ca_taskButton strong{max-width:300px;font-size:11px;font-weight:500}.H3D8Ca_taskButton small{color:#687f94;font-size:9px}.H3D8Ca_status{white-space:nowrap;color:#9faec2;text-transform:capitalize;background:#1d2837;border:1px solid #3b4656;border-radius:99px;align-items:center;padding:2px 7px;font-size:10px;display:inline-flex}.H3D8Ca_status[data-status=running],.H3D8Ca_status[data-status=ready]{color:#8ce7ca;background:#1b3832;border-color:#30584b}.H3D8Ca_status[data-status=merged]{color:#b8b2fa;background:#2b2549;border-color:#4c426e}.H3D8Ca_status[data-status=blocked],.H3D8Ca_status[data-status=paused],.H3D8Ca_status[data-status=draining]{color:#edd094;background:#3d3222;border-color:#625038}.H3D8Ca_status[data-status=failed]{color:#f3a6a2;background:#422929;border-color:#72413f}.H3D8Ca_numeric{white-space:nowrap;font-variant-numeric:tabular-nums;color:#b1c0d1}.H3D8Ca_links{white-space:nowrap;flex-direction:column;gap:5px;display:flex}.H3D8Ca_panel .H3D8Ca_links button{color:#83d7ff;text-align:left;background:0 0;border:0;padding:0;font-size:11px}.H3D8Ca_empty{text-align:center;color:#aabaca;padding:36px 20px 42px}.H3D8Ca_empty>span{color:#497565;margin-bottom:13px;font-size:45px;line-height:1.2;display:block}.H3D8Ca_empty p{color:#7d92a7;max-width:350px;font-size:12px;margin:8px auto 0!important}.H3D8Ca_lowerGrid{grid-template-columns:1fr 1fr;align-items:start;gap:16px;display:grid}.H3D8Ca_records{max-height:330px;margin:0;padding:0;list-style:none;overflow-y:auto}.H3D8Ca_records li{border-top:1px solid #253243;flex-wrap:wrap;align-items:center;gap:8px;padding:11px 0;font-size:11px;display:flex}.H3D8Ca_records li p,.H3D8Ca_records li>strong,.H3D8Ca_records li>small{overflow-wrap:anywhere;width:100%}.H3D8Ca_records li p{color:#95a9bc}.H3D8Ca_records li small{color:#718aa1;font-size:10px}.H3D8Ca_records .H3D8Ca_answer{color:#99d3c0}.H3D8Ca_placeholder{color:#73899f;padding:10px 0 16px;font-size:11px}.H3D8Ca_muted{color:#8498ad;font-size:11px}.H3D8Ca_phaseTotals{flex-wrap:wrap;gap:8px;display:flex}.H3D8Ca_phaseTotals>span{color:#9cc8d4;background:#213443;border-radius:5px;gap:9px;padding:5px 8px;font-size:10px;display:flex}.H3D8Ca_phaseTotals strong{color:#d4e8eb}.H3D8Ca_timeline{max-height:240px;margin:15px 0;padding:0 0 0 12px;list-style:none;overflow-y:auto}.H3D8Ca_timeline li{border-left:1px solid #3a5364;padding:0 0 15px 18px;position:relative}.H3D8Ca_timeline li:before{content:\"\";background:#7bb6a5;border-radius:50%;width:7px;height:7px;position:absolute;top:5px;left:-4px}.H3D8Ca_timeline time{color:#728ba2;margin-right:12px;font-size:10px}.H3D8Ca_timeline strong{text-transform:capitalize;font-size:11px;font-weight:550}.H3D8Ca_timeline p{color:#9eb0c2;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;margin-top:4px!important}.H3D8Ca_taskMetadata{color:#748ca2;flex-direction:column;gap:5px;font-size:10px;display:flex}.H3D8Ca_taskMetadata code{color:#a5bacb;margin-left:7px}.H3D8Ca_reviewEvidence{border-top:1px solid var(--cap-border);margin-top:20px;padding-top:16px}.H3D8Ca_reviewEvidence>h3{margin-bottom:5px;font-size:13px}.H3D8Ca_reviewRecord{border-top:1px solid #253243;margin-top:14px;padding-top:14px}.H3D8Ca_reviewHeading{flex-wrap:wrap;align-items:center;gap:9px;font-size:11px;display:flex}.H3D8Ca_reviewHeading>span:not(.H3D8Ca_status){color:#8b9eb1}.H3D8Ca_reviewHeading a{margin-left:auto}.H3D8Ca_reviewHeading a[aria-disabled=true]{color:#6d8194;pointer-events:none}.H3D8Ca_reviewMetadata{color:#748ca2;flex-wrap:wrap;gap:12px;margin:7px 0;font-size:10px;display:flex}.H3D8Ca_reviewMetadata code{color:#a5bacb}.H3D8Ca_findings{color:#e0b2a8;margin:9px 0;padding-left:18px;font-size:11px}.H3D8Ca_findings li{white-space:pre-wrap;overflow-wrap:anywhere;padding:3px 0}.H3D8Ca_reviewRecord summary{cursor:pointer;color:#a4bdce;font-size:11px}.H3D8Ca_reviewRecord pre{color:#96adbf;white-space:pre-wrap;overflow-wrap:anywhere;background:#0c1420;border:1px solid #28384b;border-radius:6px;max-height:230px;padding:12px;font:10px/1.6 ui-monospace,monospace;overflow:auto}.H3D8Ca_footer{color:#6d859d;align-items:center;gap:7px;padding:3px 0 8px;font-size:10px;display:flex}.H3D8Ca_footer>span:last-child{overflow-wrap:anywhere;margin-left:auto}.H3D8Ca_liveDot{background:#76b79f;border-radius:50%;flex-shrink:0;width:5px;height:5px}.H3D8Ca_error{color:#f4c0b6;overflow-wrap:anywhere;background:#3d262a;border-bottom:1px solid #714145;justify-content:space-between;align-items:center;gap:12px;padding:10px 24px;font-size:12px;display:flex}@media (width<=1100px){.H3D8Ca_backdrop{padding:12px}.H3D8Ca_panel{height:calc(100dvh - 24px)}.H3D8Ca_body{grid-template-columns:265px minmax(0,1fr)}.H3D8Ca_monitor{padding:16px}.H3D8Ca_metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.H3D8Ca_metrics>div{border-bottom:1px solid var(--cap-border)}.H3D8Ca_metrics>div:nth-child(2){border-right:0}.H3D8Ca_metrics>div:nth-child(3){border-bottom:0}.H3D8Ca_lowerGrid{grid-template-columns:1fr;gap:0}}@media (width<=720px){.H3D8Ca_backdrop{padding:0}.H3D8Ca_panel{border-radius:0;height:100dvh}.H3D8Ca_body{display:block;overflow-y:auto}.H3D8Ca_configuration,.H3D8Ca_monitor{overflow:visible}.H3D8Ca_configuration{border-right:0;border-bottom:1px solid var(--cap-border)}.H3D8Ca_header{padding:12px}.H3D8Ca_panel h1{font-size:19px}.H3D8Ca_heading{gap:8px}.H3D8Ca_mark{display:none}.H3D8Ca_owner{flex-wrap:wrap;padding:7px 12px}.H3D8Ca_owner>span{width:100%;margin-left:0}.H3D8Ca_controls label{margin-left:0}.H3D8Ca_footer{flex-wrap:wrap}}";
		const tagId = "@ihab-zhaika/dsh-delivery-captain/CaptainPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ihab-zhaika/dsh-delivery-captain";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CaptainPanel_module_css_default = {
			"answer": "H3D8Ca_answer",
			"authorization": "H3D8Ca_authorization",
			"backdrop": "H3D8Ca_backdrop",
			"body": "H3D8Ca_body",
			"card": "H3D8Ca_card",
			"check": "H3D8Ca_check",
			"configuration": "H3D8Ca_configuration",
			"controlHint": "H3D8Ca_controlHint",
			"controls": "H3D8Ca_controls",
			"danger": "H3D8Ca_danger",
			"empty": "H3D8Ca_empty",
			"entry": "H3D8Ca_entry",
			"error": "H3D8Ca_error",
			"eyebrow": "H3D8Ca_eyebrow",
			"fields": "H3D8Ca_fields",
			"findings": "H3D8Ca_findings",
			"footer": "H3D8Ca_footer",
			"header": "H3D8Ca_header",
			"heading": "H3D8Ca_heading",
			"links": "H3D8Ca_links",
			"liveDot": "H3D8Ca_liveDot",
			"lowerGrid": "H3D8Ca_lowerGrid",
			"mark": "H3D8Ca_mark",
			"metrics": "H3D8Ca_metrics",
			"monitor": "H3D8Ca_monitor",
			"muted": "H3D8Ca_muted",
			"numeric": "H3D8Ca_numeric",
			"optional": "H3D8Ca_optional",
			"owner": "H3D8Ca_owner",
			"pair": "H3D8Ca_pair",
			"panel": "H3D8Ca_panel",
			"phaseTotals": "H3D8Ca_phaseTotals",
			"placeholder": "H3D8Ca_placeholder",
			"primary": "H3D8Ca_primary",
			"records": "H3D8Ca_records",
			"reviewEvidence": "H3D8Ca_reviewEvidence",
			"reviewHeading": "H3D8Ca_reviewHeading",
			"reviewMetadata": "H3D8Ca_reviewMetadata",
			"reviewRecord": "H3D8Ca_reviewRecord",
			"sectionTitle": "H3D8Ca_sectionTitle",
			"status": "H3D8Ca_status",
			"tableScroll": "H3D8Ca_tableScroll",
			"taskButton": "H3D8Ca_taskButton",
			"taskMetadata": "H3D8Ca_taskMetadata",
			"timeline": "H3D8Ca_timeline",
			"unmeasured": "H3D8Ca_unmeasured"
		};
		//#endregion
		//#region lib/client/CaptainPanel.js
		/** Browser-only Delivery Captain surface. Mounting never enables automation. */
		const CAPTAIN_OPEN_EVENT = "delivery-captain:open";
		/** A stopped run retains its identity and claims; only Resume reactivates it. */
		function captainActionAvailability(status, loaded, busy) {
			const available = loaded && !busy;
			const active = status !== void 0 && status !== "stopped";
			return {
				start: available && status === void 0,
				pause: available && status === "running",
				resume: available && status !== void 0 && status !== "running",
				drain: available && active && status !== "draining",
				stop: available && active,
				parallelism: available && active
			};
		}
		/** Export data rather than interpreting a report string as a URL or HTML. */
		function reviewExport(task, review) {
			let report = review.report;
			try {
				report = JSON.parse(review.report);
			} catch {}
			return JSON.stringify({
				taskId: task.id,
				ticketId: task.ticket.id,
				at: review.at,
				passed: review.passed,
				headSha: review.headSha,
				findings: review.findings,
				report
			}, null, 2);
		}
		function ReviewEvidenceRow({ task, review, index }) {
			const [download, setDownload] = (0, react.useState)();
			const payload = reviewExport(task, review);
			(0, react.useEffect)(() => {
				const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
				setDownload(url);
				return () => URL.revokeObjectURL(url);
			}, [payload]);
			const filename = `delivery-review-${task.ticket.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${index + 1}.json`;
			return (0, react_jsx_runtime.jsxs)("article", {
				className: CaptainPanel_module_css_default.reviewRecord,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.reviewHeading,
						children: [
							(0, react_jsx_runtime.jsxs)("strong", { children: ["Review ", index + 1] }),
							(0, react_jsx_runtime.jsx)("span", {
								className: CaptainPanel_module_css_default.status,
								"data-status": review.passed ? "ready" : "failed",
								children: review.passed ? "Passed at review" : "Failed"
							}),
							(0, react_jsx_runtime.jsxs)("span", { children: [
								review.findings.length,
								" ",
								review.findings.length === 1 ? "finding" : "findings"
							] }),
							(0, react_jsx_runtime.jsx)("a", {
								href: download,
								download: filename,
								"aria-disabled": !download,
								children: "Download JSON ↓"
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.reviewMetadata,
						children: [(0, react_jsx_runtime.jsx)("time", {
							dateTime: review.at,
							children: new Date(review.at).toLocaleString()
						}), (0, react_jsx_runtime.jsxs)("span", { children: ["Reviewed commit ", (0, react_jsx_runtime.jsx)("code", { children: review.headSha || "Unavailable" })] })]
					}),
					review.findings.length > 0 && (0, react_jsx_runtime.jsx)("ul", {
						className: CaptainPanel_module_css_default.findings,
						children: review.findings.map((finding, findingIndex) => (0, react_jsx_runtime.jsx)("li", { children: finding }, findingIndex))
					}),
					(0, react_jsx_runtime.jsxs)("details", { children: [
						(0, react_jsx_runtime.jsx)("summary", { children: "Report excerpt" }),
						(0, react_jsx_runtime.jsx)("pre", { children: review.report ? review.report.slice(0, 4e3) : "No report text was returned." }),
						review.report.length > 4e3 && (0, react_jsx_runtime.jsx)("p", {
							className: CaptainPanel_module_css_default.muted,
							children: "Showing the first 4,000 characters. Download JSON for the complete report."
						})
					] })
				]
			});
		}
		function CaptainReviewEvidence({ task }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: CaptainPanel_module_css_default.reviewEvidence,
				children: [
					(0, react_jsx_runtime.jsx)("h3", { children: "Review evidence" }),
					(0, react_jsx_runtime.jsx)("p", {
						className: CaptainPanel_module_css_default.muted,
						children: "Results describe the recorded commit at review time. Later branch changes require a new review."
					}),
					task.reviewHistory?.length ? task.reviewHistory.map((review, index) => (0, react_jsx_runtime.jsx)(ReviewEvidenceRow, {
						task,
						review,
						index
					}, `${review.at}-${index}`)) : (0, react_jsx_runtime.jsx)("p", {
						className: CaptainPanel_module_css_default.placeholder,
						children: "No independent review has been recorded yet."
					})
				]
			});
		}
		function elapsedMs(start, end, now) {
			const value = (end ? Date.parse(end) : now) - Date.parse(start);
			return Number.isFinite(value) ? Math.max(0, value) : 0;
		}
		function phaseDurations(task, now) {
			const events = task.phases.filter((event) => Number.isFinite(Date.parse(event.at))).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
			const totals = /* @__PURE__ */ new Map();
			for (const [index, event] of events.entries()) {
				const milliseconds = elapsedMs(event.at, events[index + 1]?.at ?? task.finishedAt, now);
				totals.set(event.phase, (totals.get(event.phase) ?? 0) + milliseconds);
			}
			return Array.from(totals, ([phase, milliseconds]) => ({
				phase,
				milliseconds
			}));
		}
		function webUrl(value) {
			if (!value) return void 0;
			try {
				const url = new URL(value);
				return ["http:", "https:"].includes(url.protocol) ? url.href : void 0;
			} catch {
				return;
			}
		}
		function duration(milliseconds) {
			const seconds = Math.floor(milliseconds / 1e3);
			if (seconds < 60) return `${seconds}s`;
			const minutes = Math.floor(seconds / 60);
			return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
		}
		function defaults(workspace = "") {
			return {
				provider: "github",
				repository: "",
				workspace,
				milestones: [],
				remote: "origin",
				targetBranch: "main",
				parallelism: 2,
				maxTeamMembers: 4,
				pollSeconds: 30,
				maxRepairRounds: 3,
				maxTaskMinutes: 60,
				verifyCommands: [],
				workerPreset: "standard",
				requireBrowser: false,
				requireMemory: true
			};
		}
		function lines(value) {
			return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
		}
		function terminal(task) {
			return [
				"merged",
				"failed",
				"cancelled"
			].includes(task.status);
		}
		async function request(url, signal, body) {
			const response = await fetch(url, {
				signal,
				credentials: "same-origin",
				...body === void 0 ? {} : {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body)
				}
			});
			const value = await response.json().catch(() => null);
			if (!response.ok) {
				const detail = value && typeof value === "object" && "error" in value ? String(value.error) : response.statusText;
				throw new Error(`${response.status}: ${detail || "Delivery Captain request failed"}`);
			}
			return value;
		}
		function CaptainSurface({ openSession }) {
			const [owner, setOwner] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				const open = (event) => {
					const detail = event.detail;
					if (detail?.sessionId) setOwner(detail);
				};
				window.addEventListener(CAPTAIN_OPEN_EVENT, open);
				return () => window.removeEventListener(CAPTAIN_OPEN_EVENT, open);
			}, []);
			return owner ? (0, react_jsx_runtime.jsx)(CaptainPanel, {
				...owner,
				onClose: () => setOwner(null),
				openSession
			}, owner.sessionId) : null;
		}
		function CaptainPanel({ sessionId, workspace, onClose, openSession }) {
			const [snapshot, setSnapshot] = (0, react.useState)({ run: null });
			const [config, setConfig] = (0, react.useState)(() => defaults(workspace));
			const [milestones, setMilestones] = (0, react.useState)("");
			const [commands, setCommands] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [now, setNow] = (0, react.useState)(Date.now());
			const [selected, setSelected] = (0, react.useState)(null);
			const [parallelism, setParallelism] = (0, react.useState)(2);
			const panel = (0, react.useRef)(null);
			const controller = (0, react.useRef)(null);
			const generation = (0, react.useRef)(0);
			const mutation = (0, react.useRef)(false);
			const hydrated = (0, react.useRef)(null);
			const run = snapshot.run;
			const allowed = captainActionAvailability(run?.status, loaded, busy);
			const task = run?.tasks.find((item) => item.id === selected);
			const set = (key, value) => setConfig((previous) => ({
				...previous,
				[key]: value
			}));
			const refresh = (0, react.useCallback)(async (signal) => {
				const version = ++generation.current;
				const value = await request(`/api/delivery-captain/state?sessionId=${encodeURIComponent(sessionId)}`, signal);
				if (!value || typeof value !== "object" || !("run" in value)) throw new Error("Delivery Captain returned an invalid state");
				if (signal.aborted || version !== generation.current) return;
				setSnapshot(value);
				setLoaded(true);
				if (value.run && hydrated.current !== value.run.id) {
					hydrated.current = value.run.id;
					setConfig(value.run.config);
					setMilestones(value.run.config.milestones.join("\n"));
					setCommands(value.run.config.verifyCommands.join("\n"));
					setParallelism(value.run.config.parallelism);
				}
			}, [sessionId]);
			(0, react.useEffect)(() => {
				const abort = new AbortController();
				controller.current = abort;
				let timer;
				const poll = async () => {
					if (!mutation.current) try {
						await refresh(abort.signal);
					} catch (cause) {
						if (!abort.signal.aborted) setError(String(cause instanceof Error ? cause.message : cause));
					}
					if (!abort.signal.aborted) timer = setTimeout(() => {
						poll();
					}, 3e3);
				};
				poll();
				const clock = setInterval(() => setNow(Date.now()), 1e3);
				return () => {
					abort.abort();
					clearTimeout(timer);
					clearInterval(clock);
					generation.current++;
				};
			}, [refresh]);
			(0, react.useEffect)(() => {
				const previous = document.activeElement;
				panel.current?.focus();
				const keys = (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
					}
					if (event.key !== "Tab") return;
					const nodes = Array.from(panel.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex=\"0\"]") ?? []).filter((node) => node.getClientRects().length);
					const first = nodes[0], last = nodes.at(-1);
					if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
						event.preventDefault();
						last?.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first?.focus();
					}
				};
				document.addEventListener("keydown", keys);
				return () => {
					document.removeEventListener("keydown", keys);
					previous?.focus();
				};
			}, [onClose]);
			async function mutate(action) {
				const signal = controller.current?.signal;
				if (!signal || mutation.current) return;
				mutation.current = true;
				generation.current++;
				setBusy(true);
				try {
					await request(action ? "/api/delivery-captain/control" : "/api/delivery-captain/start", signal, action ? {
						sessionId,
						action,
						...action === "parallelism" ? { parallelism } : {}
					} : {
						sessionId,
						config: {
							...config,
							milestones: lines(milestones),
							verifyCommands: lines(commands)
						}
					});
					await refresh(signal);
				} catch (cause) {
					if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					mutation.current = false;
					if (!signal.aborted) setBusy(false);
				}
			}
			function start(event) {
				event.preventDefault();
				mutate();
			}
			async function navigate(childId) {
				try {
					await openSession(sessionId, childId);
					onClose();
				} catch (cause) {
					setError(`Could not open worker session: ${String(cause)}`);
				}
			}
			const merged = run?.tasks.filter((item) => item.status === "merged").length ?? 0;
			const working = run?.tasks.filter((item) => !terminal(item)).length ?? 0;
			const blockers = run?.tasks.filter((item) => item.error || item.status === "blocked" || item.status === "failed") ?? [];
			const totalTaskTime = run?.tasks.reduce((sum, item) => sum + elapsedMs(item.startedAt, item.finishedAt, now), 0) ?? 0;
			const eligibility = snapshot.eligibility ?? run?.tickets.map((ticket) => {
				const existing = run.tasks.find((item) => item.ticket.id === ticket.id);
				return {
					ticketId: ticket.id,
					eligible: false,
					reason: existing ? `Task ${existing.status}` : ticket.exclusion ?? (ticket.merged ? "Already merged" : ticket.state === "closed" ? "Closed" : "Awaiting captain eligibility evaluation")
				};
			}) ?? [];
			return (0, react_jsx_runtime.jsx)("div", {
				className: CaptainPanel_module_css_default.backdrop,
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: CaptainPanel_module_css_default.panel,
					ref: panel,
					tabIndex: -1,
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "captain-title",
					"data-delivery-captain": true,
					children: [
						(0, react_jsx_runtime.jsxs)("header", {
							className: CaptainPanel_module_css_default.header,
							children: [(0, react_jsx_runtime.jsxs)("div", {
								className: CaptainPanel_module_css_default.heading,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: CaptainPanel_module_css_default.mark,
										"aria-hidden": true,
										children: "⌁"
									}),
									(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("span", {
										className: CaptainPanel_module_css_default.eyebrow,
										children: "AUTONOMOUS DELIVERY"
									}), (0, react_jsx_runtime.jsx)("h1", {
										id: "captain-title",
										children: "Delivery Captain"
									})] }),
									(0, react_jsx_runtime.jsx)("span", {
										className: CaptainPanel_module_css_default.status,
										"data-status": run?.status ?? "idle",
										children: run?.status ?? "Not started"
									})
								]
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: onClose,
								"aria-label": "Close Delivery Captain",
								children: "✕"
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: CaptainPanel_module_css_default.owner,
							children: [
								"Session ",
								(0, react_jsx_runtime.jsx)("code", { children: sessionId }),
								(0, react_jsx_runtime.jsx)("span", { children: "Opening this panel never starts a run." })
							]
						}),
						error && (0, react_jsx_runtime.jsxs)("div", {
							className: CaptainPanel_module_css_default.error,
							role: "alert",
							children: [(0, react_jsx_runtime.jsx)("span", { children: error }), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setError(null),
								children: "Dismiss"
							})]
						}),
						run?.error && (0, react_jsx_runtime.jsxs)("div", {
							className: CaptainPanel_module_css_default.error,
							role: "alert",
							children: ["Captain: ", run.error]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: CaptainPanel_module_css_default.body,
							children: [(0, react_jsx_runtime.jsxs)("aside", {
								className: CaptainPanel_module_css_default.configuration,
								children: [(0, react_jsx_runtime.jsxs)("div", {
									className: CaptainPanel_module_css_default.sectionTitle,
									children: [(0, react_jsx_runtime.jsx)("h2", { children: "Run configuration" }), (0, react_jsx_runtime.jsx)("span", { children: run ? "Saved run configuration" : "Ready when you are" })]
								}), (0, react_jsx_runtime.jsxs)("form", {
									onSubmit: start,
									children: [
										(0, react_jsx_runtime.jsxs)("fieldset", {
											disabled: !!run || busy,
											className: CaptainPanel_module_css_default.fields,
											children: [
												(0, react_jsx_runtime.jsxs)("label", { children: ["Ticket source", (0, react_jsx_runtime.jsxs)("select", {
													value: config.provider,
													onChange: (event) => set("provider", event.target.value),
													children: [(0, react_jsx_runtime.jsx)("option", {
														value: "github",
														children: "GitHub Issues"
													}), (0, react_jsx_runtime.jsx)("option", {
														value: "azure",
														children: "Azure DevOps"
													})]
												})] }),
												(0, react_jsx_runtime.jsxs)("label", { children: ["Repository", (0, react_jsx_runtime.jsx)("input", {
													required: true,
													value: config.repository,
													placeholder: "owner/repository",
													onChange: (event) => set("repository", event.target.value)
												})] }),
												(0, react_jsx_runtime.jsxs)("label", { children: ["Workspace", (0, react_jsx_runtime.jsx)("input", {
													required: true,
													value: config.workspace,
													placeholder: "Absolute path on the DSH host",
													onChange: (event) => set("workspace", event.target.value)
												})] }),
												config.provider === "azure" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("label", { children: ["Organization URL", (0, react_jsx_runtime.jsx)("input", {
													required: true,
													value: config.organization ?? "",
													placeholder: "https://dev.azure.com/organization",
													onChange: (event) => set("organization", event.target.value)
												})] }), (0, react_jsx_runtime.jsxs)("label", { children: ["Project", (0, react_jsx_runtime.jsx)("input", {
													required: true,
													value: config.project ?? "",
													onChange: (event) => set("project", event.target.value)
												})] })] }),
												(0, react_jsx_runtime.jsxs)("label", { children: [
													"Query ",
													(0, react_jsx_runtime.jsx)("span", {
														className: CaptainPanel_module_css_default.optional,
														children: "(optional)"
													}),
													(0, react_jsx_runtime.jsx)("textarea", {
														rows: 2,
														value: config.query ?? "",
														onChange: (event) => set("query", event.target.value),
														placeholder: config.provider === "azure" ? "WIQL query" : "Additional issue search filters"
													})
												] }),
												(0, react_jsx_runtime.jsxs)("label", { children: [
													"Milestones, in delivery order",
													(0, react_jsx_runtime.jsx)("textarea", {
														required: true,
														rows: 3,
														value: milestones,
														onChange: (event) => setMilestones(event.target.value),
														placeholder: "Foundation\nCore experience\nRelease"
													}),
													(0, react_jsx_runtime.jsx)("small", { children: "One exact milestone name per line." })
												] }),
												(0, react_jsx_runtime.jsxs)("div", {
													className: CaptainPanel_module_css_default.pair,
													children: [(0, react_jsx_runtime.jsxs)("label", { children: ["Remote", (0, react_jsx_runtime.jsx)("input", {
														required: true,
														value: config.remote,
														onChange: (event) => set("remote", event.target.value)
													})] }), (0, react_jsx_runtime.jsxs)("label", { children: ["Target branch", (0, react_jsx_runtime.jsx)("input", {
														required: true,
														value: config.targetBranch,
														onChange: (event) => set("targetBranch", event.target.value)
													})] })]
												}),
												(0, react_jsx_runtime.jsxs)("div", {
													className: CaptainPanel_module_css_default.pair,
													children: [(0, react_jsx_runtime.jsxs)("label", { children: ["Parallel tickets", (0, react_jsx_runtime.jsx)("input", {
														required: true,
														type: "number",
														min: 1,
														max: 32,
														value: config.parallelism,
														onChange: (event) => set("parallelism", Number(event.target.value))
													})] }), (0, react_jsx_runtime.jsxs)("label", { children: ["Members / team", (0, react_jsx_runtime.jsx)("input", {
														required: true,
														type: "number",
														min: 1,
														max: 16,
														value: config.maxTeamMembers,
														onChange: (event) => set("maxTeamMembers", Number(event.target.value))
													})] })]
												}),
												(0, react_jsx_runtime.jsxs)("label", { children: [
													"Verification commands",
													(0, react_jsx_runtime.jsx)("textarea", {
														required: true,
														rows: 3,
														value: commands,
														onChange: (event) => setCommands(event.target.value),
														placeholder: "pnpm typecheck\npnpm test"
													}),
													(0, react_jsx_runtime.jsx)("small", { children: "One host command per line, run in each task worktree." })
												] }),
												(0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", { children: "Execution limits & verification" }), (0, react_jsx_runtime.jsxs)("div", {
													className: CaptainPanel_module_css_default.fields,
													children: [
														(0, react_jsx_runtime.jsxs)("div", {
															className: CaptainPanel_module_css_default.pair,
															children: [(0, react_jsx_runtime.jsxs)("label", { children: ["Poll seconds", (0, react_jsx_runtime.jsx)("input", {
																required: true,
																type: "number",
																min: 5,
																max: 3600,
																value: config.pollSeconds,
																onChange: (event) => set("pollSeconds", Number(event.target.value))
															})] }), (0, react_jsx_runtime.jsxs)("label", { children: ["Repair rounds", (0, react_jsx_runtime.jsx)("input", {
																required: true,
																type: "number",
																min: 0,
																max: 20,
																value: config.maxRepairRounds,
																onChange: (event) => set("maxRepairRounds", Number(event.target.value))
															})] })]
														}),
														(0, react_jsx_runtime.jsxs)("label", { children: ["Task timeout (minutes)", (0, react_jsx_runtime.jsx)("input", {
															required: true,
															type: "number",
															min: 1,
															max: 1440,
															value: config.maxTaskMinutes,
															onChange: (event) => set("maxTaskMinutes", Number(event.target.value))
														})] }),
														(0, react_jsx_runtime.jsxs)("label", { children: ["Worker preset", (0, react_jsx_runtime.jsx)("input", {
															required: true,
															value: config.workerPreset,
															onChange: (event) => set("workerPreset", event.target.value)
														})] }),
														(0, react_jsx_runtime.jsxs)("label", {
															className: CaptainPanel_module_css_default.check,
															children: [(0, react_jsx_runtime.jsx)("input", {
																type: "checkbox",
																checked: config.requireMemory,
																onChange: (event) => set("requireMemory", event.target.checked)
															}), "Require durable memory"]
														}),
														(0, react_jsx_runtime.jsxs)("label", {
															className: CaptainPanel_module_css_default.check,
															children: [(0, react_jsx_runtime.jsx)("input", {
																type: "checkbox",
																checked: config.requireBrowser,
																onChange: (event) => set("requireBrowser", event.target.checked)
															}), "Require browser verification"]
														})
													]
												})] })
											]
										}),
										(0, react_jsx_runtime.jsx)("p", {
											className: CaptainPanel_module_css_default.authorization,
											children: "Start authorizes full access execution, autonomous repair, review, merge and ticket closure within this configuration. The captain answers worker questions automatically."
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "submit",
											className: CaptainPanel_module_css_default.primary,
											disabled: !allowed.start,
											children: busy ? "Applying…" : run ? "Run already created" : "Start Delivery Captain"
										}),
										run?.status === "stopped" && (0, react_jsx_runtime.jsx)("p", {
											className: CaptainPanel_module_css_default.muted,
											children: "Use Resume to continue this saved run with its existing tasks and claims."
										}),
										!loaded && (0, react_jsx_runtime.jsx)("p", {
											className: CaptainPanel_module_css_default.muted,
											children: "Loading saved run before enabling Start…"
										})
									]
								})]
							}), (0, react_jsx_runtime.jsxs)("main", {
								className: CaptainPanel_module_css_default.monitor,
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: CaptainPanel_module_css_default.metrics,
										children: [
											(0, react_jsx_runtime.jsxs)("div", { children: [
												(0, react_jsx_runtime.jsx)("span", { children: "Wall time" }),
												(0, react_jsx_runtime.jsx)("strong", { children: run ? duration(elapsedMs(run.createdAt, run.status === "stopped" ? run.updatedAt : void 0, now)) : "—" }),
												(0, react_jsx_runtime.jsx)("small", { children: "Includes waiting & pauses" })
											] }),
											(0, react_jsx_runtime.jsxs)("div", { children: [
												(0, react_jsx_runtime.jsx)("span", { children: "Working / parallel limit" }),
												(0, react_jsx_runtime.jsxs)("strong", { children: [working, (0, react_jsx_runtime.jsxs)("em", { children: [" / ", run?.config.parallelism ?? config.parallelism] })] }),
												(0, react_jsx_runtime.jsxs)("small", { children: [
													merged,
													" merged · ",
													run?.tickets.length ?? 0,
													" discovered"
												] })
											] }),
											(0, react_jsx_runtime.jsxs)("div", { children: [
												(0, react_jsx_runtime.jsx)("span", { children: "Task elapsed, summed" }),
												(0, react_jsx_runtime.jsx)("strong", { children: run ? duration(totalTaskTime) : "—" }),
												(0, react_jsx_runtime.jsx)("small", { children: "Overlaps; includes waiting" })
											] }),
											(0, react_jsx_runtime.jsxs)("div", { children: [
												(0, react_jsx_runtime.jsx)("span", { children: "Active agent effort" }),
												(0, react_jsx_runtime.jsx)("strong", {
													className: CaptainPanel_module_css_default.unmeasured,
													children: "Not measured"
												}),
												(0, react_jsx_runtime.jsx)("small", { children: "No runtime effort telemetry" })
											] })
										]
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										className: CaptainPanel_module_css_default.controls,
										"aria-label": "Run controls",
										children: [
											(0, react_jsx_runtime.jsx)("button", {
												disabled: !allowed.pause,
												onClick: () => void mutate("pause"),
												children: "Pause"
											}),
											(0, react_jsx_runtime.jsx)("button", {
												disabled: !allowed.resume,
												onClick: () => void mutate("resume"),
												children: "Resume"
											}),
											(0, react_jsx_runtime.jsx)("button", {
												disabled: !allowed.drain,
												onClick: () => void mutate("drain"),
												title: "Finish active work without taking more tickets",
												children: "Drain"
											}),
											(0, react_jsx_runtime.jsx)("button", {
												className: CaptainPanel_module_css_default.danger,
												disabled: !allowed.stop,
												onClick: () => void mutate("stop"),
												children: "Stop"
											}),
											(0, react_jsx_runtime.jsxs)("label", { children: ["Parallelism", (0, react_jsx_runtime.jsx)("input", {
												"aria-label": "Live parallelism",
												type: "number",
												min: 1,
												max: 32,
												value: parallelism,
												disabled: !allowed.parallelism,
												onChange: (event) => setParallelism(Number(event.target.value))
											})] }),
											(0, react_jsx_runtime.jsx)("button", {
												disabled: !allowed.parallelism || !Number.isInteger(parallelism) || parallelism < 1 || parallelism > 32,
												onClick: () => void mutate("parallelism"),
												children: "Apply"
											})
										]
									}),
									(0, react_jsx_runtime.jsx)("p", {
										className: CaptainPanel_module_css_default.controlHint,
										children: "Pause holds new dispatch. Drain finishes active tickets. Stop cancels active work."
									}),
									(0, react_jsx_runtime.jsxs)("section", {
										className: CaptainPanel_module_css_default.card,
										children: [
											(0, react_jsx_runtime.jsxs)("div", {
												className: CaptainPanel_module_css_default.sectionTitle,
												children: [(0, react_jsx_runtime.jsx)("h2", { children: "Delivery queue" }), (0, react_jsx_runtime.jsx)("span", { children: run?.lastPollAt ? `Last discovery ${new Date(run.lastPollAt).toLocaleTimeString()}` : "Awaiting discovery" })]
											}),
											(0, react_jsx_runtime.jsx)("div", {
												className: CaptainPanel_module_css_default.tableScroll,
												children: (0, react_jsx_runtime.jsxs)("table", { children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
													(0, react_jsx_runtime.jsx)("th", { children: "Ticket / task" }),
													(0, react_jsx_runtime.jsx)("th", { children: "Milestone" }),
													(0, react_jsx_runtime.jsx)("th", { children: "Status" }),
													(0, react_jsx_runtime.jsx)("th", { children: "Phase" }),
													(0, react_jsx_runtime.jsx)("th", { children: "Elapsed" }),
													(0, react_jsx_runtime.jsx)("th", { children: "Reviews" }),
													(0, react_jsx_runtime.jsx)("th", { children: "Open" })
												] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: run?.tasks.map((item) => (0, react_jsx_runtime.jsxs)("tr", {
													"data-selected": selected === item.id,
													children: [
														(0, react_jsx_runtime.jsx)("td", { children: (0, react_jsx_runtime.jsxs)("button", {
															className: CaptainPanel_module_css_default.taskButton,
															onClick: () => setSelected(item.id),
															children: [
																(0, react_jsx_runtime.jsx)("code", { children: item.ticket.id }),
																(0, react_jsx_runtime.jsx)("strong", { children: item.ticket.title }),
																(0, react_jsx_runtime.jsx)("small", { children: item.id })
															]
														}) }),
														(0, react_jsx_runtime.jsx)("td", { children: item.ticket.milestone }),
														(0, react_jsx_runtime.jsx)("td", { children: (0, react_jsx_runtime.jsx)("span", {
															className: CaptainPanel_module_css_default.status,
															"data-status": item.status,
															children: item.status
														}) }),
														(0, react_jsx_runtime.jsx)("td", { children: item.phase }),
														(0, react_jsx_runtime.jsx)("td", {
															className: CaptainPanel_module_css_default.numeric,
															children: duration(elapsedMs(item.startedAt, item.finishedAt, now))
														}),
														(0, react_jsx_runtime.jsx)("td", {
															className: CaptainPanel_module_css_default.numeric,
															children: item.reviewRounds
														}),
														(0, react_jsx_runtime.jsx)("td", { children: (0, react_jsx_runtime.jsxs)("div", {
															className: CaptainPanel_module_css_default.links,
															children: [
																item.sessionId && (0, react_jsx_runtime.jsx)("button", {
																	onClick: () => void navigate(item.sessionId),
																	children: "Session ↗"
																}),
																webUrl(item.prUrl) && (0, react_jsx_runtime.jsx)("a", {
																	href: webUrl(item.prUrl),
																	target: "_blank",
																	rel: "noreferrer",
																	children: "PR ↗"
																}),
																webUrl(item.ticket.url) && (0, react_jsx_runtime.jsx)("a", {
																	href: webUrl(item.ticket.url),
																	target: "_blank",
																	rel: "noreferrer",
																	children: "Ticket ↗"
																})
															]
														}) })
													]
												}, item.id)) })] })
											}),
											!run?.tasks.length && (0, react_jsx_runtime.jsxs)("div", {
												className: CaptainPanel_module_css_default.empty,
												children: [
													(0, react_jsx_runtime.jsx)("span", {
														"aria-hidden": true,
														children: "⌁"
													}),
													(0, react_jsx_runtime.jsx)("h3", { children: run ? "Watching the delivery queue" : "Your next milestone starts here" }),
													(0, react_jsx_runtime.jsx)("p", { children: run ? "Tasks appear after the captain discovers and admits eligible tickets." : "Choose a source, order your milestones, then explicitly start the captain." })
												]
											})
										]
									}),
									task && (0, react_jsx_runtime.jsxs)("section", {
										className: CaptainPanel_module_css_default.card,
										children: [
											(0, react_jsx_runtime.jsxs)("div", {
												className: CaptainPanel_module_css_default.sectionTitle,
												children: [(0, react_jsx_runtime.jsxs)("h2", { children: [task.ticket.id, " · Phase timeline"] }), (0, react_jsx_runtime.jsx)("button", {
													onClick: () => setSelected(null),
													"aria-label": "Close task details",
													children: "✕"
												})]
											}),
											(0, react_jsx_runtime.jsx)("div", {
												className: CaptainPanel_module_css_default.phaseTotals,
												children: phaseDurations(task, now).map((row) => (0, react_jsx_runtime.jsxs)("span", { children: [row.phase, (0, react_jsx_runtime.jsx)("strong", { children: duration(row.milliseconds) })] }, row.phase))
											}),
											(0, react_jsx_runtime.jsx)("ol", {
												className: CaptainPanel_module_css_default.timeline,
												children: task.phases.map((event, index) => (0, react_jsx_runtime.jsxs)("li", { children: [
													(0, react_jsx_runtime.jsx)("time", { children: new Date(event.at).toLocaleTimeString() }),
													(0, react_jsx_runtime.jsx)("strong", { children: event.phase }),
													event.note && (0, react_jsx_runtime.jsx)("p", { children: event.note })
												] }, `${event.at}-${index}`))
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: CaptainPanel_module_css_default.taskMetadata,
												children: [
													(0, react_jsx_runtime.jsxs)("span", { children: ["Branch ", (0, react_jsx_runtime.jsx)("code", { children: task.branch })] }),
													(0, react_jsx_runtime.jsxs)("span", { children: ["Worktree ", (0, react_jsx_runtime.jsx)("code", { children: task.worktree })] }),
													task.mergedSha && (0, react_jsx_runtime.jsxs)("span", { children: ["Merged ", (0, react_jsx_runtime.jsx)("code", { children: task.mergedSha })] })
												]
											}),
											(0, react_jsx_runtime.jsx)(CaptainReviewEvidence, { task })
										]
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										className: CaptainPanel_module_css_default.lowerGrid,
										children: [(0, react_jsx_runtime.jsxs)("section", {
											className: CaptainPanel_module_css_default.card,
											children: [
												(0, react_jsx_runtime.jsxs)("div", {
													className: CaptainPanel_module_css_default.sectionTitle,
													children: [(0, react_jsx_runtime.jsx)("h2", { children: "Eligibility" }), (0, react_jsx_runtime.jsxs)("span", { children: [eligibility.length, " tickets"] })]
												}),
												(0, react_jsx_runtime.jsx)("ul", {
													className: CaptainPanel_module_css_default.records,
													children: eligibility.map((row) => (0, react_jsx_runtime.jsxs)("li", { children: [
														(0, react_jsx_runtime.jsx)("code", { children: row.ticketId }),
														(0, react_jsx_runtime.jsx)("span", {
															className: CaptainPanel_module_css_default.status,
															"data-status": row.eligible ? "ready" : "waiting",
															children: row.eligible ? "Eligible" : "Held"
														}),
														(0, react_jsx_runtime.jsx)("p", { children: row.reason })
													] }, row.ticketId))
												}),
												!eligibility.length && (0, react_jsx_runtime.jsx)("p", {
													className: CaptainPanel_module_css_default.placeholder,
													children: "Discovery decisions will appear here."
												})
											]
										}), (0, react_jsx_runtime.jsxs)("section", {
											className: CaptainPanel_module_css_default.card,
											children: [
												(0, react_jsx_runtime.jsxs)("div", {
													className: CaptainPanel_module_css_default.sectionTitle,
													children: [(0, react_jsx_runtime.jsx)("h2", { children: "Blockers & decisions" }), (0, react_jsx_runtime.jsx)("span", { children: "Captain managed" })]
												}),
												(0, react_jsx_runtime.jsxs)("ul", {
													className: CaptainPanel_module_css_default.records,
													children: [blockers.map((item) => (0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsxs)("strong", { children: [
														item.ticket.id,
														" · ",
														item.status
													] }), (0, react_jsx_runtime.jsx)("p", { children: item.error ?? "Waiting for the captain to resolve this blocker." })] }, item.id)), run?.questions.map((question) => (0, react_jsx_runtime.jsxs)("li", { children: [
														(0, react_jsx_runtime.jsxs)("small", { children: [
															question.taskId,
															" · ",
															new Date(question.createdAt).toLocaleTimeString()
														] }),
														(0, react_jsx_runtime.jsx)("strong", { children: question.question }),
														(0, react_jsx_runtime.jsx)("p", {
															className: question.answer ? CaptainPanel_module_css_default.answer : CaptainPanel_module_css_default.muted,
															children: question.answer ?? "Captain is preparing an automatic answer…"
														}),
														question.answer && (0, react_jsx_runtime.jsx)("small", { children: question.deliveredAt ? "Delivered to worker" : "Answer queued for delivery" })
													] }, question.id))]
												}),
												!blockers.length && !run?.questions.length && (0, react_jsx_runtime.jsx)("p", {
													className: CaptainPanel_module_css_default.placeholder,
													children: "No blockers or worker questions recorded."
												})
											]
										})]
									}),
									(0, react_jsx_runtime.jsxs)("footer", {
										className: CaptainPanel_module_css_default.footer,
										children: [
											(0, react_jsx_runtime.jsx)("span", { className: CaptainPanel_module_css_default.liveDot }),
											"Refreshes every 3 seconds while open",
											(0, react_jsx_runtime.jsx)("span", { children: run ? `Run ${run.id}` : "Automation is disabled" })
										]
									})
								]
							})]
						})
					]
				})
			});
		}
		//#endregion
		//#region lib/client/captain-index.js
		const inject = [
			"slots",
			"sessions",
			"layout"
		];
		function apply(ctx) {
			const Entry = ({ sessionId }) => (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: CaptainPanel_module_css_default.entry,
				title: "Configure and monitor autonomous ticket delivery",
				onClick: () => {
					const detail = {
						sessionId,
						workspace: ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
					};
					window.dispatchEvent(new CustomEvent(CAPTAIN_OPEN_EVENT, { detail }));
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": true,
					children: "⌁"
				}), "Delivery Captain"]
			});
			const openSession = async (_parentId, childId) => {
				const workspace = ctx.get("uiWorkspace");
				const sessions = ctx.sessions;
				if (workspace) workspace.openSession(childId);
				else if (sessions.open) sessions.open(childId);
				else throw new Error("Harness does not expose ordinary session navigation");
				ctx.layout.selectPanel?.(null);
			};
			const Surface = () => (0, react_jsx_runtime.jsx)(CaptainSurface, { openSession });
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "delivery-captain-entry",
				order: 55
			}, Entry));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "delivery-captain-panel",
				order: 90,
				label: "Delivery Captain"
			}, Surface));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map