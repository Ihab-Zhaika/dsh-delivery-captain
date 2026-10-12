window.__ModuleLoader__.load({
	id: "@ihab-zhaika/dsh-darkingdoom",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region \0dsh-css:C:\Projects\dark-dsh-harness\src\client\CaptainPanel.module.css.mjs
		const css = ".H3D8Ca_entry{border:1px solid var(--dsw-alias-border-l2,#354151);background:var(--dsw-alias-bg-module-platform,#17202c);color:var(--dsw-alias-label-primary,#e8eff7);font:inherit;cursor:pointer;border-radius:8px;align-items:center;gap:7px;padding:6px 10px;font-size:12px;display:inline-flex}.H3D8Ca_entry>span{color:#77ddc2;font-size:20px;line-height:12px}.H3D8Ca_panel{--cap-border:#293443;--cap-muted:#94a3b5;box-sizing:border-box;color:#e8edf5;color-scheme:dark;background:#101722;flex-direction:column;width:100%;min-width:0;height:100%;min-height:0;font:13px/1.5 system-ui,sans-serif;display:flex;overflow:hidden;container-type:inline-size}.H3D8Ca_panel *,.H3D8Ca_panel :before,.H3D8Ca_panel :after{box-sizing:border-box}.H3D8Ca_panel [hidden]{display:none}.H3D8Ca_panel h1,.H3D8Ca_panel h2,.H3D8Ca_panel h3,.H3D8Ca_panel p{margin:0}.H3D8Ca_panel h1{letter-spacing:-.4px;font-size:18px;font-weight:650;line-height:1.25}.H3D8Ca_panel h2{font-size:14px;font-weight:650}.H3D8Ca_panel h3{font-size:17px;font-weight:550}.H3D8Ca_panel button,.H3D8Ca_panel input,.H3D8Ca_panel select,.H3D8Ca_panel textarea{font:inherit}.H3D8Ca_panel button{color:#dfe8f3;cursor:pointer;background:#1c2736;border:1px solid #374456;border-radius:7px;padding:6px 11px;transition:background .12s,border-color .12s}.H3D8Ca_panel button:hover:not(:disabled),.H3D8Ca_entry:hover{background:#28394b;border-color:#6c8b9c}.H3D8Ca_panel button:disabled{opacity:.4;cursor:not-allowed}.H3D8Ca_panel :is(button,input,select,textarea,summary,a):focus-visible,.H3D8Ca_entry:focus-visible{outline-offset:3px;outline:2px solid #7ce0c3}.H3D8Ca_panel a{color:#83d7ff;text-decoration:none}.H3D8Ca_panel a:hover{text-decoration:underline}.H3D8Ca_panel code{overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:11px}.H3D8Ca_header{border-bottom:1px solid var(--cap-border);background:linear-gradient(115deg,#182936,#141c2b 60%);justify-content:space-between;align-items:center;gap:8px;padding:14px 16px;display:flex}.H3D8Ca_heading{flex-wrap:wrap;align-items:center;gap:8px;min-width:0;display:flex}.H3D8Ca_mark{color:#8af2d3;background:#1d423c;border:1px solid #387963;border-radius:8px;place-items:center;width:32px;height:32px;font-size:26px;line-height:1;display:grid}.H3D8Ca_eyebrow{letter-spacing:2.2px;color:#84beaf;font-size:9px;font-weight:650}.H3D8Ca_owner{color:var(--cap-muted);border-bottom:1px solid var(--cap-border);flex-wrap:wrap;align-items:center;gap:4px;padding:8px 16px;font-size:11px;display:flex}.H3D8Ca_owner>code{min-width:0}.H3D8Ca_owner>span{width:100%}.H3D8Ca_origin{border-bottom:1px solid var(--cap-border);background:#18312f;flex-direction:column;gap:6px;padding:12px 16px;display:flex}.H3D8Ca_origin button{text-align:left;overflow-wrap:anywhere;color:#8eddf6}.H3D8Ca_origin small{color:var(--cap-muted)}.H3D8Ca_graphScroll{border:1px solid var(--cap-border);background:#0c1420;border-radius:8px;max-height:460px;margin:12px 0;overflow:auto}.H3D8Ca_graphCanvas{position:relative}.H3D8Ca_graphCanvas>svg{pointer-events:none;position:absolute;inset:0}.H3D8Ca_panel .H3D8Ca_graphNode{text-align:left;border-left:3px solid #607d91;flex-direction:column;gap:5px;width:205px;height:102px;padding:8px 10px;display:flex;position:absolute}.H3D8Ca_graphNode strong{justify-content:space-between;gap:6px;display:flex}.H3D8Ca_graphNode span,.H3D8Ca_graphNode small{color:#a6b8cc;font-size:10px}.H3D8Ca_graphNode p{-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:11px;line-height:1.4;display:-webkit-box;overflow:hidden}.H3D8Ca_panel .H3D8Ca_graphNode[aria-pressed=true]{outline:2px solid #83d7ff}.H3D8Ca_panel .H3D8Ca_graphNode:is([data-status=eligible],[data-status=delivered],[data-status=decision-complete]){border-left-color:#80d5bb}.H3D8Ca_panel .H3D8Ca_graphNode:is([data-status=parked],[data-status=blocked],[data-status=dependency]){border-left-color:#dbac61}.H3D8Ca_graphDetail{overflow-wrap:anywhere;background:#1d2b32;border-radius:6px;margin-bottom:12px;padding:12px}.H3D8Ca_status[data-status=parked]{color:#eac485;background:#493b26;border-color:#76603d}.H3D8Ca_views{border-bottom:1px solid var(--cap-border);gap:8px;padding:10px 16px;display:flex}.H3D8Ca_views button{flex:1}.H3D8Ca_views button[aria-pressed=true]{color:#a5efd9;background:#24443f;border-color:#619c8e}.H3D8Ca_body{flex:1;min-height:0;overflow-y:auto}.H3D8Ca_configuration{background:#131c28;padding:16px}.H3D8Ca_sectionTitle{justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px;display:flex}.H3D8Ca_sectionTitle>span{color:var(--cap-muted);text-align:right;font-size:10px}.H3D8Ca_configuration .H3D8Ca_sectionTitle{flex-direction:column;align-items:start;gap:2px}.H3D8Ca_fields{border:0;flex-direction:column;gap:13px;min-width:0;margin:0;padding:0;display:flex}.H3D8Ca_fields label{color:#bcc9d9;flex-direction:column;gap:5px;font-size:11px;display:flex}.H3D8Ca_fields input,.H3D8Ca_fields select,.H3D8Ca_fields textarea,.H3D8Ca_controls input{color:#e6edf6;background:#0c1420;border:1px solid #344153;border-radius:6px;width:100%;min-width:0;padding:8px 9px}.H3D8Ca_fields textarea{resize:vertical;min-height:50px;line-height:1.6}.H3D8Ca_fields input:disabled,.H3D8Ca_fields textarea:disabled,.H3D8Ca_fields select:disabled{opacity:.65}.H3D8Ca_fields small,.H3D8Ca_optional{color:#7c8ca2;font-size:10px}.H3D8Ca_fields .H3D8Ca_check{flex-direction:row;align-items:center;gap:8px}.H3D8Ca_check input{accent-color:#7ce0c3;width:15px;height:15px}.H3D8Ca_pair{grid-template-columns:1fr 1fr;gap:10px;display:grid}.H3D8Ca_fields summary{cursor:pointer;color:#afd5cd;padding:8px 0;font-size:11px}.H3D8Ca_authorization{color:#a6b9c4;background:#1d2b32;border-left:2px solid #619c8e;border-radius:3px;padding:11px;font-size:10px;line-height:1.7;margin:17px 0 11px!important}.H3D8Ca_panel .H3D8Ca_primary{color:#0e3029;background:#88dec4;border-color:#80d5bb;width:100%;padding:10px;font-weight:700}.H3D8Ca_panel .H3D8Ca_primary:hover:not(:disabled){background:#a5efd9}.H3D8Ca_monitor{min-width:0;padding:16px}.H3D8Ca_metrics{border:1px solid var(--cap-border);background:#151f2c;border-radius:10px;grid-template-columns:repeat(2,minmax(0,1fr));display:grid;overflow:hidden}.H3D8Ca_metrics>div{border-right:1px solid var(--cap-border);flex-direction:column;gap:4px;padding:16px;display:flex}.H3D8Ca_metrics>div:last-child{border:0}.H3D8Ca_metrics>div:nth-child(-n+2){border-bottom:1px solid var(--cap-border)}.H3D8Ca_metrics>div:nth-child(2){border-right:0}.H3D8Ca_metrics span{color:#a6b6c9;font-size:10px}.H3D8Ca_metrics strong{letter-spacing:-.6px;font-variant-numeric:tabular-nums;font-size:26px;font-weight:550}.H3D8Ca_metrics em{color:#647b8b;font-size:16px;font-style:normal}.H3D8Ca_metrics small{color:#6e829a;font-size:10px}.H3D8Ca_metrics .H3D8Ca_unmeasured{letter-spacing:0;color:#8095a9;font-size:15px;line-height:39px}.H3D8Ca_controls{flex-wrap:wrap;align-items:center;gap:7px;margin-top:17px;display:flex}.H3D8Ca_controls label{color:#9bafc4;align-items:center;gap:7px;font-size:11px;display:flex}.H3D8Ca_controls input{width:56px;padding:6px}.H3D8Ca_panel .H3D8Ca_danger{color:#eca49d;border-color:#67403e}.H3D8Ca_controlHint{color:#778a9f;font-size:10px;margin:8px 0 19px!important}.H3D8Ca_card{border:1px solid var(--cap-border);background:#131d2a;border-radius:10px;min-width:0;margin-bottom:16px;padding:16px}.H3D8Ca_tableScroll{margin:0 -16px;overflow-x:auto}.H3D8Ca_panel table{border-collapse:collapse;text-align:left;width:100%;font-size:11px}.H3D8Ca_panel th{color:#72879e;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid var(--cap-border);white-space:nowrap;padding:9px 10px;font-size:9px;font-weight:600}.H3D8Ca_panel td{vertical-align:top;border-bottom:1px solid #223041;padding:12px 10px}.H3D8Ca_panel td:first-child,.H3D8Ca_panel th:first-child{padding-left:16px}.H3D8Ca_panel tbody tr:last-child td{border-bottom:0}.H3D8Ca_panel tr[data-selected=true]{background:#1d303b}.H3D8Ca_panel .H3D8Ca_taskButton{text-align:left;background:0 0;border:0;flex-direction:column;gap:3px;min-width:155px;padding:0;display:flex}.H3D8Ca_taskButton code{color:#83d9c1}.H3D8Ca_taskButton strong{max-width:300px;font-size:11px;font-weight:500}.H3D8Ca_taskButton small{color:#687f94;font-size:9px}.H3D8Ca_status{white-space:nowrap;color:#9faec2;text-transform:capitalize;background:#1d2837;border:1px solid #3b4656;border-radius:99px;align-items:center;padding:2px 7px;font-size:10px;display:inline-flex}.H3D8Ca_status[data-status=running],.H3D8Ca_status[data-status=ready]{color:#8ce7ca;background:#1b3832;border-color:#30584b}.H3D8Ca_status[data-status=merged]{color:#b8b2fa;background:#2b2549;border-color:#4c426e}.H3D8Ca_status[data-status=blocked],.H3D8Ca_status[data-status=paused],.H3D8Ca_status[data-status=draining]{color:#edd094;background:#3d3222;border-color:#625038}.H3D8Ca_status[data-status=failed]{color:#f3a6a2;background:#422929;border-color:#72413f}.H3D8Ca_numeric{white-space:nowrap;font-variant-numeric:tabular-nums;color:#b1c0d1}.H3D8Ca_links{white-space:nowrap;flex-direction:column;gap:5px;display:flex}.H3D8Ca_panel .H3D8Ca_links button{color:#83d7ff;text-align:left;background:0 0;border:0;padding:0;font-size:11px}.H3D8Ca_empty{text-align:center;color:#aabaca;padding:36px 20px 42px}.H3D8Ca_empty>span{color:#497565;margin-bottom:13px;font-size:45px;line-height:1.2;display:block}.H3D8Ca_empty p{color:#7d92a7;max-width:350px;font-size:12px;margin:8px auto 0!important}.H3D8Ca_lowerGrid{grid-template-columns:1fr;align-items:start;display:grid}.H3D8Ca_records{max-height:330px;margin:0;padding:0;list-style:none;overflow-y:auto}.H3D8Ca_records li{border-top:1px solid #253243;flex-wrap:wrap;align-items:center;gap:8px;padding:11px 0;font-size:11px;display:flex}.H3D8Ca_records li p,.H3D8Ca_records li>strong,.H3D8Ca_records li>small{overflow-wrap:anywhere;width:100%}.H3D8Ca_records li p{color:#95a9bc}.H3D8Ca_records li small{color:#718aa1;font-size:10px}.H3D8Ca_records .H3D8Ca_answer{color:#99d3c0}.H3D8Ca_placeholder{color:#73899f;padding:10px 0 16px;font-size:11px}.H3D8Ca_muted{color:#8498ad;font-size:11px}.H3D8Ca_phaseTotals{flex-wrap:wrap;gap:8px;display:flex}.H3D8Ca_phaseTotals>span{color:#9cc8d4;background:#213443;border-radius:5px;gap:9px;padding:5px 8px;font-size:10px;display:flex}.H3D8Ca_phaseTotals strong{color:#d4e8eb}.H3D8Ca_timeline{max-height:240px;margin:15px 0;padding:0 0 0 12px;list-style:none;overflow-y:auto}.H3D8Ca_timeline li{border-left:1px solid #3a5364;padding:0 0 15px 18px;position:relative}.H3D8Ca_timeline li:before{content:\"\";background:#7bb6a5;border-radius:50%;width:7px;height:7px;position:absolute;top:5px;left:-4px}.H3D8Ca_timeline time{color:#728ba2;margin-right:12px;font-size:10px}.H3D8Ca_timeline strong{text-transform:capitalize;font-size:11px;font-weight:550}.H3D8Ca_timeline p{color:#9eb0c2;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;margin-top:4px!important}.H3D8Ca_taskMetadata{color:#748ca2;flex-direction:column;gap:5px;font-size:10px;display:flex}.H3D8Ca_taskMetadata code{color:#a5bacb;margin-left:7px}.H3D8Ca_reviewEvidence{border-top:1px solid var(--cap-border);margin-top:20px;padding-top:16px}.H3D8Ca_reviewEvidence>h3{margin-bottom:5px;font-size:13px}.H3D8Ca_reviewRecord{border-top:1px solid #253243;margin-top:14px;padding-top:14px}.H3D8Ca_reviewHeading{flex-wrap:wrap;align-items:center;gap:9px;font-size:11px;display:flex}.H3D8Ca_reviewHeading>span:not(.H3D8Ca_status){color:#8b9eb1}.H3D8Ca_reviewHeading a{margin-left:auto}.H3D8Ca_reviewHeading a[aria-disabled=true]{color:#6d8194;pointer-events:none}.H3D8Ca_reviewMetadata{color:#748ca2;flex-wrap:wrap;gap:12px;margin:7px 0;font-size:10px;display:flex}.H3D8Ca_reviewMetadata code{color:#a5bacb}.H3D8Ca_findings{color:#e0b2a8;margin:9px 0;padding-left:18px;font-size:11px}.H3D8Ca_findings li{white-space:pre-wrap;overflow-wrap:anywhere;padding:3px 0}.H3D8Ca_reviewRecord summary{cursor:pointer;color:#a4bdce;font-size:11px}.H3D8Ca_reviewRecord pre{color:#96adbf;white-space:pre-wrap;overflow-wrap:anywhere;background:#0c1420;border:1px solid #28384b;border-radius:6px;max-height:230px;padding:12px;font:10px/1.6 ui-monospace,monospace;overflow:auto}.H3D8Ca_footer{color:#6d859d;flex-wrap:wrap;align-items:center;gap:7px;padding:3px 0 8px;font-size:10px;display:flex}.H3D8Ca_footer>span:last-child{overflow-wrap:anywhere;margin-left:auto}.H3D8Ca_liveDot{background:#76b79f;border-radius:50%;flex-shrink:0;width:5px;height:5px}.H3D8Ca_error{color:#f4c0b6;overflow-wrap:anywhere;background:#3d262a;border-bottom:1px solid #714145;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;font-size:12px;display:flex}@container (width<=420px){.H3D8Ca_mark{display:none}.H3D8Ca_panel h1{font-size:17px}.H3D8Ca_header,.H3D8Ca_configuration,.H3D8Ca_monitor{padding:12px}.H3D8Ca_owner{padding:7px 12px}}@container (width>=700px){.H3D8Ca_metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.H3D8Ca_metrics>div:nth-child(-n+2){border-bottom:0}.H3D8Ca_metrics>div:nth-child(2){border-right:1px solid var(--cap-border)}.H3D8Ca_lowerGrid{grid-template-columns:1fr 1fr;gap:16px}}";
		const tagId = "@ihab-zhaika/dsh-darkingdoom/CaptainPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ihab-zhaika/dsh-darkingdoom";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CaptainPanel_module_css_default = {
			"answer": "H3D8Ca_answer",
			"authorization": "H3D8Ca_authorization",
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
			"graphCanvas": "H3D8Ca_graphCanvas",
			"graphDetail": "H3D8Ca_graphDetail",
			"graphNode": "H3D8Ca_graphNode",
			"graphScroll": "H3D8Ca_graphScroll",
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
			"origin": "H3D8Ca_origin",
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
			"unmeasured": "H3D8Ca_unmeasured",
			"views": "H3D8Ca_views"
		};
		//#endregion
		//#region lib/client/CaptainPanel.js
		/** Native sidebar content. Mounting never enables automation or captures chat focus. */
		const MAX_OCR_TOKENS_BUDGET = 1e7;
		function validReviewBudget(value) {
			return Number.isSafeInteger(value) && value >= 1 && value <= MAX_OCR_TOKENS_BUDGET;
		}
		function intakePolicy(config) {
			return {
				includeUnmilestoned: config.includeUnmilestoned ?? false,
				includeRequiredPredecessors: config.includeRequiredPredecessors ?? false,
				ocrMaxTokensBudget: config.ocrMaxTokensBudget ?? 1e6
			};
		}
		function scopeLabel(row) {
			if (row?.scope === "predecessor") return row.requiredFor?.length ? `Required by ${row.requiredFor.map((id) => `#${id}`).join(", ")}` : "Required predecessor";
			return row?.scope === "unmilestoned" ? "Included without a milestone" : "";
		}
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
		function configurationEditable(status, loaded, busy, worker) {
			return loaded && !busy && !worker && (status === void 0 || status === "stopped");
		}
		function shouldHydrateConfiguration(previousRunId, runId, dirty, previousConfig, currentConfig) {
			return previousRunId !== runId || !dirty && previousConfig !== currentConfig;
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
			const historical = index < (task.reviewHistory?.length ?? 0) - 1;
			return (0, react_jsx_runtime.jsxs)("article", {
				className: CaptainPanel_module_css_default.reviewRecord,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.reviewHeading,
						children: [
							(0, react_jsx_runtime.jsxs)("strong", { children: ["Review ", index + 1] }),
							(0, react_jsx_runtime.jsx)("span", {
								className: CaptainPanel_module_css_default.status,
								"data-status": review.passed ? "ready" : historical ? "waiting" : "failed",
								children: review.passed ? "Passed at review" : historical ? "Historical failure" : "Failed"
							}),
							(0, react_jsx_runtime.jsx)("span", { children: review.failureKind === "team-evidence" ? "Team evidence unavailable" : review.failureKind === "infrastructure" ? "Verification could not complete" : `${review.findings.length} ${review.findings.length === 1 ? "finding" : "findings"}` }),
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
			const latest = task.reviewHistory?.at(-1);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: CaptainPanel_module_css_default.reviewEvidence,
				children: [
					(0, react_jsx_runtime.jsx)("h3", { children: "Review evidence" }),
					(0, react_jsx_runtime.jsx)("p", {
						className: CaptainPanel_module_css_default.muted,
						children: "Results describe the recorded commit at review time. Later branch changes require a new review."
					}),
					latest && (0, react_jsx_runtime.jsx)("p", {
						className: CaptainPanel_module_css_default.authorization,
						children: latest.passed ? task.status === "merged" && latest.headSha === task.headSha ? "Current gate passed; reviewed commit was delivered." : "Last recorded review passed; current head must still match before merge." : `Latest gate failed: ${latest.failureKind === "team-evidence" ? "original team evidence must be repaired" : latest.failureKind === "infrastructure" ? "verification infrastructure must be repaired" : "findings must be resolved"}. Historical entries remain below.`
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
		/** Bounded DAG layout; cycles stay visible rather than recursing forever. */
		function eligibilityGraph(tickets) {
			const byId = new Map(tickets.map((t) => [t.id, {
				...t,
				missing: false
			}]));
			for (const ticket of tickets) for (const id of ticket.predecessors) if (!byId.has(id)) byId.set(id, {
				id,
				title: "Missing predecessor",
				predecessors: [],
				missing: true
			});
			const levels = /* @__PURE__ */ new Map(), remaining = new Set(byId.keys());
			for (let pass = 0; pass < byId.size && remaining.size; pass++) for (const id of [...remaining]) {
				const node = byId.get(id);
				if (node.predecessors.every((p) => levels.has(p))) {
					levels.set(id, node.predecessors.length ? 1 + Math.max(...node.predecessors.map((p) => levels.get(p))) : 0);
					remaining.delete(id);
				}
			}
			for (const id of remaining) levels.set(id, 0);
			const counts = /* @__PURE__ */ new Map();
			const nodes = [...byId.values()].map((node) => {
				const column = levels.get(node.id) ?? 0, row = counts.get(column) ?? 0;
				counts.set(column, row + 1);
				return {
					...node,
					x: 20 + column * 240,
					y: 20 + row * 130
				};
			});
			return {
				nodes,
				edges: tickets.flatMap((t) => t.predecessors.map((from) => ({
					from,
					to: t.id
				}))),
				width: Math.max(280, ...nodes.map((n) => n.x + 230)),
				height: Math.max(160, ...nodes.map((n) => n.y + 120))
			};
		}
		function CaptainEligibilityGraph({ tickets, rows }) {
			const [selected, setSelected] = (0, react.useState)();
			const arrowId = `darkingdoom-arrow-${(0, react.useId)().replace(/:/g, "")}`;
			const graph = eligibilityGraph(tickets), byId = new Map(graph.nodes.map((n) => [n.id, n])), decisions = new Map(rows.map((r) => [r.ticketId, r]));
			const node = byId.get(selected ?? ""), decision = decisions.get(selected ?? "");
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("p", {
					className: CaptainPanel_module_css_default.muted,
					children: "Arrows point from prerequisites to dependent tickets. Parking frees capacity but does not satisfy a predecessor. Independent tickets in later milestones can still run; milestone order sets priority."
				}),
				(0, react_jsx_runtime.jsx)("div", {
					className: CaptainPanel_module_css_default.graphScroll,
					role: "region",
					"aria-label": "Ticket dependency graph",
					tabIndex: 0,
					children: (0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.graphCanvas,
						style: {
							width: graph.width,
							height: graph.height
						},
						children: [(0, react_jsx_runtime.jsxs)("svg", {
							width: graph.width,
							height: graph.height,
							"aria-hidden": "true",
							children: [(0, react_jsx_runtime.jsx)("defs", { children: (0, react_jsx_runtime.jsx)("marker", {
								id: arrowId,
								viewBox: "0 0 10 10",
								refX: "9",
								refY: "5",
								markerWidth: "7",
								markerHeight: "7",
								orient: "auto",
								children: (0, react_jsx_runtime.jsx)("path", {
									d: "M 0 0 L 10 5 L 0 10 z",
									fill: "#607d91"
								})
							}) }), graph.edges.map((edge, index) => {
								const a = byId.get(edge.from), b = byId.get(edge.to);
								return (0, react_jsx_runtime.jsx)("path", {
									d: `M ${a.x + 205} ${a.y + 48} C ${a.x + 225} ${a.y + 48}, ${b.x - 20} ${b.y + 48}, ${b.x} ${b.y + 48}`,
									fill: "none",
									stroke: "#607d91",
									strokeWidth: "2",
									markerEnd: `url(#${arrowId})`
								}, index);
							})]
						}), graph.nodes.map((n) => {
							const row = decisions.get(n.id);
							return (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: CaptainPanel_module_css_default.graphNode,
								style: {
									left: n.x,
									top: n.y
								},
								"data-status": row?.state ?? "dependency",
								"aria-pressed": selected === n.id,
								"aria-label": `Ticket ${n.id}: ${row?.state ?? "missing predecessor"}. ${row?.reason ?? n.title}. ${scopeLabel(row)}`,
								onClick: () => setSelected(n.id),
								children: [
									(0, react_jsx_runtime.jsxs)("strong", { children: [
										"#",
										n.id,
										" ",
										(0, react_jsx_runtime.jsx)("span", { children: row?.state ?? "missing" })
									] }),
									(0, react_jsx_runtime.jsx)("p", { children: n.title }),
									(0, react_jsx_runtime.jsxs)("small", { children: [tickets.find((t) => t.id === n.id)?.milestone || "Unassigned", scopeLabel(row) && ` · ${scopeLabel(row)}`] })
								]
							}, n.id);
						})]
					})
				}),
				node && (0, react_jsx_runtime.jsxs)("div", {
					className: CaptainPanel_module_css_default.graphDetail,
					children: [
						(0, react_jsx_runtime.jsxs)("strong", { children: [
							"#",
							node.id,
							" · ",
							node.title
						] }),
						(0, react_jsx_runtime.jsx)("p", { children: decision?.reason ?? "Missing from discovery; delivery cannot proceed without predecessor evidence." }),
						scopeLabel(decision) && (0, react_jsx_runtime.jsx)("p", { children: scopeLabel(decision) }),
						(0, react_jsx_runtime.jsxs)("small", { children: ["Predecessors: ", node.predecessors.join(", ") || "None"] })
					]
				}),
				(0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
					"All eligibility reasons (",
					rows.length,
					")"
				] }), (0, react_jsx_runtime.jsx)("ul", {
					className: CaptainPanel_module_css_default.records,
					children: rows.map((row) => (0, react_jsx_runtime.jsxs)("li", { children: [
						(0, react_jsx_runtime.jsx)("code", { children: row.ticketId }),
						" ",
						(0, react_jsx_runtime.jsx)("span", {
							className: CaptainPanel_module_css_default.status,
							"data-status": row.state ?? "waiting",
							children: row.state ?? (row.eligible ? "eligible" : "waiting")
						}),
						scopeLabel(row) && (0, react_jsx_runtime.jsx)("small", { children: scopeLabel(row) }),
						(0, react_jsx_runtime.jsx)("p", { children: row.reason })
					] }, row.ticketId))
				})] })
			] });
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
				includeUnmilestoned: true,
				includeRequiredPredecessors: true,
				ocrMaxTokensBudget: 1e6,
				remote: "",
				targetBranch: "",
				parallelism: 2,
				maxTickets: 0,
				maxTeamMembers: 4,
				pollSeconds: 30,
				maxRepairRounds: 3,
				maxTaskMinutes: 120,
				verifyCommands: [],
				workerPreset: "standard",
				requireBrowser: false,
				requireMemory: false
			};
		}
		function lines(value) {
			return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
		}
		function parseTicketSelection(value) {
			const ids = value.split(/[\s,]+/).filter(Boolean);
			return ids.length ? ids : void 0;
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
				throw new Error(`${body === void 0 ? "GET" : "POST"} ${url.split("?")[0]} — ${response.status}: ${detail || "DarKingDoom Plugin request failed"}`);
			}
			return value;
		}
		function CaptainPanel({ sessionId, workspace, onClose, openSession, initialSnapshot }) {
			const [snapshot, setSnapshot] = (0, react.useState)(initialSnapshot ?? { run: null });
			const [config, setConfig] = (0, react.useState)(() => ({
				...defaults(workspace),
				...initialSnapshot?.run?.config,
				...initialSnapshot?.run ? intakePolicy(initialSnapshot.run.config) : {}
			}));
			const [policy, setPolicy] = (0, react.useState)(() => intakePolicy(initialSnapshot?.run?.config ?? defaults(workspace)));
			const [milestones, setMilestones] = (0, react.useState)("");
			const [commands, setCommands] = (0, react.useState)("");
			const [ticketSelection, setTicketSelection] = (0, react.useState)(initialSnapshot?.run?.config.ticketIds?.join(", ") ?? "");
			const [busy, setBusy] = (0, react.useState)(false);
			const [loaded, setLoaded] = (0, react.useState)(!!initialSnapshot);
			const [repository, setRepository] = (0, react.useState)(null);
			const [contextLoading, setContextLoading] = (0, react.useState)(true);
			const [source, setSource] = (0, react.useState)();
			const [view, setView] = (0, react.useState)("configuration");
			const [error, setError] = (0, react.useState)(null);
			const [pollError, setPollError] = (0, react.useState)(null);
			const [contextError, setContextError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [dirty, setDirty] = (0, react.useState)(false);
			const [now, setNow] = (0, react.useState)(Date.now());
			const [selected, setSelected] = (0, react.useState)(null);
			const [parallelism, setParallelism] = (0, react.useState)(2);
			const [resumeEvidence, setResumeEvidence] = (0, react.useState)("");
			const controller = (0, react.useRef)(null);
			const generation = (0, react.useRef)(0);
			const mutation = (0, react.useRef)(false);
			const hydrated = (0, react.useRef)(null);
			const hydratedConfig = (0, react.useRef)("");
			const draftDirty = (0, react.useRef)(false);
			const policyDirty = (0, react.useRef)(false);
			const policyRun = (0, react.useRef)(initialSnapshot?.run?.id ?? null);
			const commandsEdited = (0, react.useRef)(false);
			const run = snapshot.run;
			const worker = snapshot.role === "worker" || !!run && run.captainSessionId !== sessionId;
			const allowed = captainActionAvailability(run?.status, loaded, busy);
			const editable = configurationEditable(run?.status, loaded, busy, worker);
			const policyEditable = loaded && !busy && !worker && (run?.status === "running" || run?.status === "paused");
			const task = worker ? run?.tasks[0] : run?.tasks.find((item) => item.id === selected);
			const displayedError = error ?? pollError ?? (!worker ? contextError : null);
			const markDirty = () => {
				draftDirty.current = true;
				setDirty(true);
			};
			const set = (key, value) => {
				markDirty();
				setConfig((previous) => ({
					...previous,
					[key]: value
				}));
			};
			const setPolicyValue = (key, value) => {
				policyDirty.current = true;
				setPolicy((previous) => ({
					...previous,
					[key]: value
				}));
			};
			(0, react.useEffect)(() => {
				if (!loaded || worker || run && run.status !== "stopped") return;
				const abort = new AbortController();
				setContextLoading(true);
				const provider = run?.config.provider ?? source;
				request(`/api/darkingdoom/context?sessionId=${encodeURIComponent(sessionId)}${provider ? `&provider=${provider}` : ""}`, abort.signal).then((value) => {
					if (abort.signal.aborted) return;
					setContextError(null);
					setRepository(value);
					if (run || hydrated.current) return;
					setConfig((previous) => ({
						...previous,
						provider: value.config.provider,
						workspace: value.config.workspace,
						repository: value.config.repository,
						organization: value.config.organization,
						project: value.config.project,
						remote: value.config.remote,
						targetBranch: value.config.targetBranch,
						query: void 0
					}));
					setMilestones(value.config.milestones.join("\n"));
					if (!commandsEdited.current) setCommands(value.config.verifyCommands.join("\n"));
				}).catch((cause) => {
					if (!abort.signal.aborted) {
						setRepository(null);
						setContextError(String(cause instanceof Error ? cause.message : cause));
					}
				}).finally(() => {
					if (!abort.signal.aborted) setContextLoading(false);
				});
				return () => abort.abort();
			}, [
				loaded,
				run?.status,
				sessionId,
				source,
				worker
			]);
			const refresh = (0, react.useCallback)(async (signal) => {
				const version = ++generation.current;
				let value;
				try {
					value = await request(`/api/darkingdoom/state?sessionId=${encodeURIComponent(sessionId)}`, signal);
				} catch (cause) {
					if (signal.aborted || version !== generation.current) return;
					throw cause;
				}
				if (signal.aborted || version !== generation.current) return;
				if (!value || typeof value !== "object" || !("run" in value)) throw new Error("DarKingDoom Plugin returned an invalid state");
				setPollError(null);
				setSnapshot(value);
				setLoaded(true);
				if (value.run && (policyRun.current !== value.run.id || !policyDirty.current)) {
					policyRun.current = value.run.id;
					policyDirty.current = false;
					setPolicy(intakePolicy(value.run.config));
				}
				if (value.run && shouldHydrateConfiguration(hydrated.current, value.run.id, draftDirty.current, hydratedConfig.current, JSON.stringify(value.run.config))) {
					const newRun = hydrated.current !== value.run.id;
					hydrated.current = value.run.id;
					hydratedConfig.current = JSON.stringify(value.run.config);
					draftDirty.current = false;
					setDirty(false);
					setConfig(value.run.config);
					setMilestones(value.run.config.milestones.join("\n"));
					setCommands(value.run.config.verifyCommands.join("\n"));
					setTicketSelection(value.run.config.ticketIds?.join(", ") ?? "");
					setParallelism(value.run.config.parallelism);
					if (newRun) setView("monitor");
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
						if (!abort.signal.aborted) setPollError(String(cause instanceof Error ? cause.message : cause));
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
			async function mutate(action) {
				const signal = controller.current?.signal;
				if (!signal || mutation.current) return;
				if (action === "policy" && (!policyEditable || !validReviewBudget(policy.ocrMaxTokensBudget))) return;
				if ((action === void 0 || action === "save") && !validReviewBudget(config.ocrMaxTokensBudget ?? 1e6)) return;
				mutation.current = true;
				generation.current++;
				setBusy(true);
				setError(null);
				try {
					const value = await request(action === "policy" ? "/api/darkingdoom/policy" : action === "save" ? "/api/darkingdoom/configure" : action ? "/api/darkingdoom/control" : "/api/darkingdoom/start", signal, action === "policy" ? {
						sessionId,
						...policy
					} : action && action !== "save" ? {
						sessionId,
						action,
						...action === "parallelism" ? { parallelism } : {}
					} : {
						sessionId,
						config: {
							...config,
							...intakePolicy(config),
							ticketIds: parseTicketSelection(ticketSelection),
							milestones: lines(milestones),
							verifyCommands: lines(commands)
						}
					});
					if (action === "policy") {
						policyDirty.current = false;
						setPolicy(intakePolicy(value.run.config));
						setNotice("Policy saved. Intake changes apply to new dispatch; each future OCR review session uses its own token budget.");
					}
					if (action === "save") {
						draftDirty.current = false;
						setDirty(false);
						hydratedConfig.current = JSON.stringify(value.run.config);
						setConfig(value.run.config);
						setMilestones(value.run.config.milestones.join("\n"));
						setCommands(value.run.config.verifyCommands.join("\n"));
						setParallelism(value.run.config.parallelism);
						setTicketSelection(value.run.config.ticketIds?.join(", ") ?? "");
						setNotice("Configuration saved. The run is still stopped; choose Resume when ready.");
					}
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
				mutate(run?.status === "stopped" ? "save" : void 0);
			}
			async function navigate(childId) {
				try {
					await openSession(sessionId, childId);
				} catch (cause) {
					setError(`Could not open worker session: ${String(cause)}`);
				}
			}
			async function resumeParked(item) {
				const signal = controller.current?.signal;
				if (!signal || busy || worker) return;
				setBusy(true);
				mutation.current = true;
				try {
					await request("/api/darkingdoom/resume-task", signal, {
						sessionId,
						taskId: item.id,
						evidence: resumeEvidence
					});
					setResumeEvidence("");
					await refresh(signal);
				} catch (cause) {
					setError(String(cause));
				} finally {
					mutation.current = false;
					setBusy(false);
				}
			}
			const merged = run?.tasks.filter((item) => item.status === "merged").length ?? 0;
			const working = run?.tasks.filter((item) => [
				"starting",
				"running",
				"ready"
			].includes(item.status) || ["blocked", "parked"].includes(item.status) && item.executionActive).length ?? 0;
			const blockers = run?.tasks.filter((item) => item.error || item.status === "blocked" || item.status === "parked" || item.status === "failed") ?? [];
			const totalTaskTime = run?.tasks.reduce((sum, item) => sum + elapsedMs(item.startedAt, item.finishedAt, now), 0) ?? 0;
			const eligibility = snapshot.eligibility ?? run?.tickets.map((ticket) => {
				const existing = run.tasks.find((item) => item.ticket.id === ticket.id);
				return {
					ticketId: ticket.id,
					eligible: false,
					reason: existing ? `Task ${existing.status}` : ticket.exclusion ?? (ticket.merged ? "Already merged" : ticket.state === "closed" ? "Closed" : "Awaiting captain eligibility evaluation")
				};
			}) ?? [];
			return (0, react_jsx_runtime.jsxs)("section", {
				className: CaptainPanel_module_css_default.panel,
				role: "region",
				"aria-labelledby": "darkingdoom-title",
				"data-darkingdoom": true,
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
									id: "darkingdoom-title",
									children: "DarKingDoom Plugin"
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
							"aria-label": "Close DarKingDoom Plugin",
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
					worker && (0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.origin,
						children: [
							(0, react_jsx_runtime.jsx)("span", { children: "Initiated by coordination session" }),
							(0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => void navigate(run.captainSessionId),
								children: [run.captainSessionId, " ↗"]
							}),
							(0, react_jsx_runtime.jsx)("small", { children: "This worker view is read-only. Run controls belong to the coordinator." })
						]
					}),
					displayedError && (0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.error,
						role: "alert",
						children: [(0, react_jsx_runtime.jsx)("span", { children: displayedError }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								setError(null);
								setPollError(null);
								setContextError(null);
							},
							children: "Dismiss"
						})]
					}),
					notice && (0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.origin,
						role: "status",
						children: [(0, react_jsx_runtime.jsx)("span", { children: notice }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setNotice(null),
							children: "Dismiss"
						})]
					}),
					run?.error && (0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.error,
						role: "alert",
						children: ["Captain: ", run.error]
					}),
					!worker && run?.coordinatorLoopError && (0, react_jsx_runtime.jsx)("div", {
						className: CaptainPanel_module_css_default.error,
						role: "alert",
						children: run.coordinatorLoopError
					}),
					!worker && run && (0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.origin,
						"aria-label": "Coordinator loop",
						children: [
							(0, react_jsx_runtime.jsxs)("strong", { children: ["Coordinator loop: ", snapshot.coordinatorLoop?.status === "active" && snapshot.coordinatorLoop.activation !== "armed" ? "needs Resume" : snapshot.coordinatorLoop?.status ?? "not started"] }),
							(0, react_jsx_runtime.jsxs)("small", { children: [snapshot.coordinatorLoop?.maxGoalRounds ? `Native DSH goal · ${snapshot.coordinatorLoop.roundsStarted ?? 0} / ${snapshot.coordinatorLoop.maxGoalRounds} rounds` : "Start or Resume enables native loop mode in this main chat.", snapshot.coordinatorLoop?.status === "waiting" ? " · Quietly awaiting new delivery events" : ""] }),
							snapshot.coordinatorLoop?.reason && (0, react_jsx_runtime.jsx)("p", { children: snapshot.coordinatorLoop.reason }),
							run.status === "running" && snapshot.coordinatorLoop?.activation !== "armed" && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: busy || !loaded,
								onClick: () => void mutate("loop"),
								children: snapshot.coordinatorLoop?.status === "waiting" ? "Wake coordinator" : "Start coordinator loop"
							})
						]
					}),
					!worker && (0, react_jsx_runtime.jsxs)("nav", {
						className: CaptainPanel_module_css_default.views,
						"aria-label": "Plugin view",
						children: [(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": view === "configuration",
							onClick: () => setView("configuration"),
							children: "Configuration"
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": view === "monitor",
							onClick: () => setView("monitor"),
							children: "Monitor"
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: CaptainPanel_module_css_default.body,
						children: [!worker && (0, react_jsx_runtime.jsxs)("aside", {
							hidden: view !== "configuration",
							className: CaptainPanel_module_css_default.configuration,
							children: [
								(0, react_jsx_runtime.jsxs)("div", {
									className: CaptainPanel_module_css_default.sectionTitle,
									children: [(0, react_jsx_runtime.jsx)("h2", { children: "Run configuration" }), (0, react_jsx_runtime.jsx)("span", { children: run ? "Saved run configuration" : contextLoading ? "Loading repository configuration…" : "From the current session repository" })]
								}),
								!run && repository?.warnings.map((warning, index) => (0, react_jsx_runtime.jsx)("p", {
									className: CaptainPanel_module_css_default.muted,
									children: warning
								}, index)),
								(0, react_jsx_runtime.jsxs)("form", {
									onSubmit: start,
									children: [
										(0, react_jsx_runtime.jsxs)("fieldset", {
											disabled: !editable,
											className: CaptainPanel_module_css_default.fields,
											children: [
												(0, react_jsx_runtime.jsxs)("label", { children: ["Ticket source", (0, react_jsx_runtime.jsxs)("select", {
													disabled: !!run || contextLoading && loaded,
													value: config.provider,
													onChange: (event) => {
														setContextLoading(true);
														setSource(event.target.value);
													},
													children: [(0, react_jsx_runtime.jsx)("option", {
														value: "github",
														disabled: repository ? !repository.providers.includes("github") : false,
														children: "GitHub Issues"
													}), (0, react_jsx_runtime.jsx)("option", {
														value: "azure",
														disabled: repository ? !repository.providers.includes("azure") : false,
														children: "Azure DevOps"
													})]
												})] }),
												(0, react_jsx_runtime.jsxs)("label", { children: ["Repository", (0, react_jsx_runtime.jsx)("input", {
													required: true,
													readOnly: true,
													value: config.repository,
													placeholder: "Detected from this session"
												})] }),
												(0, react_jsx_runtime.jsxs)("label", { children: ["Workspace", (0, react_jsx_runtime.jsx)("input", {
													required: true,
													readOnly: true,
													value: config.workspace,
													placeholder: "Current session repository"
												})] }),
												config.provider === "azure" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("label", { children: ["Organization URL", (0, react_jsx_runtime.jsx)("input", {
													required: true,
													readOnly: true,
													value: config.organization ?? ""
												})] }), (0, react_jsx_runtime.jsxs)("label", { children: ["Project", (0, react_jsx_runtime.jsx)("input", {
													required: true,
													readOnly: true,
													value: config.project ?? ""
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
													"Ticket IDs ",
													(0, react_jsx_runtime.jsx)("span", {
														className: CaptainPanel_module_css_default.optional,
														children: "(optional)"
													}),
													(0, react_jsx_runtime.jsx)("input", {
														value: ticketSelection,
														onChange: (event) => {
															markDirty();
															setTicketSelection(event.target.value);
														},
														placeholder: "All eligible tickets"
													}),
													(0, react_jsx_runtime.jsx)("small", { children: "Separate IDs with commas. Blank allows all eligible tickets; selected milestone scope and dependency gates still apply." })
												] }),
												(0, react_jsx_runtime.jsxs)("label", { children: [
													"Milestones, in priority order",
													(0, react_jsx_runtime.jsx)("textarea", {
														disabled: contextLoading,
														required: !config.includeUnmilestoned,
														rows: 3,
														value: milestones,
														onChange: (event) => {
															markDirty();
															setMilestones(event.target.value);
														},
														placeholder: "Detected delivery milestones"
													}),
													(0, react_jsx_runtime.jsx)("small", { children: repository?.milestoneSource || "One exact milestone name per line. Leave blank to run only tickets without a milestone when enabled." })
												] }),
												(0, react_jsx_runtime.jsxs)("label", {
													className: CaptainPanel_module_css_default.check,
													children: [(0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: config.includeUnmilestoned ?? false,
														onChange: (event) => set("includeUnmilestoned", event.target.checked)
													}), "Include tickets without a milestone"]
												}),
												(0, react_jsx_runtime.jsxs)("label", {
													className: CaptainPanel_module_css_default.check,
													children: [(0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: config.includeRequiredPredecessors ?? false,
														onChange: (event) => set("includeRequiredPredecessors", event.target.checked)
													}), "Include required predecessors outside the selected milestones"]
												}),
												(0, react_jsx_runtime.jsx)("p", {
													className: CaptainPanel_module_css_default.muted,
													children: "Milestone order sets priority; dependencies still gate dispatch. Required predecessors can run before the selected tickets that need them."
												}),
												(0, react_jsx_runtime.jsxs)("label", { children: [
													"Token budget per OCR review session",
													(0, react_jsx_runtime.jsx)("input", {
														required: true,
														type: "number",
														min: 1,
														step: 1,
														max: MAX_OCR_TOKENS_BUDGET,
														value: config.ocrMaxTokensBudget ?? 1e6,
														onChange: (event) => set("ocrMaxTokensBudget", Number(event.target.value))
													}),
													(0, react_jsx_runtime.jsx)("small", { children: "Each review has its own budget; no shared pool across workers or the run." })
												] }),
												(0, react_jsx_runtime.jsxs)("div", {
													className: CaptainPanel_module_css_default.pair,
													children: [(0, react_jsx_runtime.jsxs)("label", { children: ["Remote", (0, react_jsx_runtime.jsx)("input", {
														required: true,
														readOnly: true,
														value: config.remote
													})] }), (0, react_jsx_runtime.jsxs)("label", { children: ["Target branch", (0, react_jsx_runtime.jsx)("input", {
														required: true,
														readOnly: true,
														value: config.targetBranch
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
														disabled: contextLoading,
														required: true,
														rows: 3,
														value: commands,
														onChange: (event) => {
															markDirty();
															commandsEdited.current = true;
															setCommands(event.target.value);
														},
														placeholder: "Detected repository checks"
													}),
													(0, react_jsx_runtime.jsx)("small", { children: repository?.verificationSource || "One host command per line, run in each task worktree." })
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
														(0, react_jsx_runtime.jsxs)("label", { children: [
															"Ticket limit",
															(0, react_jsx_runtime.jsx)("input", {
																required: true,
																type: "number",
																min: 0,
																max: 1e5,
																value: config.maxTickets ?? 0,
																onChange: (event) => set("maxTickets", Number(event.target.value))
															}),
															(0, react_jsx_runtime.jsx)("small", { children: "0 keeps consuming; 1 runs a single-ticket trial. Attempts count toward the limit." })
														] }),
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
											children: "Start enables the native coordinator loop in this chat and authorizes full access execution, autonomous repair, review, merge and ticket closure within this configuration. The captain answers worker questions automatically."
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "submit",
											className: CaptainPanel_module_css_default.primary,
											disabled: !(run?.status === "stopped" ? editable : allowed.start) || contextLoading || !repository || !config.targetBranch || !config.includeUnmilestoned && !lines(milestones).length || lines(milestones).some((name) => !repository.milestoneCatalog.includes(name)) || !lines(commands).length || !validReviewBudget(config.ocrMaxTokensBudget ?? 1e6),
											children: busy ? "Applying…" : run?.status === "stopped" ? "Save configuration" : run ? "Run already created" : "Start DarKingDoom Plugin"
										}),
										run?.status === "stopped" && (0, react_jsx_runtime.jsx)("p", {
											className: CaptainPanel_module_css_default.muted,
											children: "Save changes, then use Resume in Monitor. History, parked tasks and existing task contracts are preserved; new settings apply to future tickets. Source, repository and target identity stay bound to this run."
										}),
										!loaded && (0, react_jsx_runtime.jsx)("p", {
											className: CaptainPanel_module_css_default.muted,
											children: "Loading saved run before enabling Start…"
										})
									]
								})
							]
						}), (0, react_jsx_runtime.jsxs)("main", {
							hidden: !worker && view !== "monitor",
							className: CaptainPanel_module_css_default.monitor,
							children: [
								worker && task && (0, react_jsx_runtime.jsxs)("section", {
									className: CaptainPanel_module_css_default.card,
									children: [
										(0, react_jsx_runtime.jsxs)("div", {
											className: CaptainPanel_module_css_default.sectionTitle,
											children: [(0, react_jsx_runtime.jsxs)("h2", { children: [
												"#",
												task.ticket.id,
												" · ",
												task.ticket.title
											] }), (0, react_jsx_runtime.jsx)("span", {
												className: CaptainPanel_module_css_default.status,
												"data-status": task.status,
												children: task.status
											})]
										}),
										(0, react_jsx_runtime.jsxs)("div", {
											className: CaptainPanel_module_css_default.metrics,
											children: [(0, react_jsx_runtime.jsxs)("div", { children: [
												(0, react_jsx_runtime.jsx)("span", { children: "Total task elapsed" }),
												(0, react_jsx_runtime.jsx)("strong", { children: duration(elapsedMs(task.startedAt, task.finishedAt, now)) }),
												(0, react_jsx_runtime.jsx)("small", { children: "Includes blocked and parked waiting" })
											] }), (0, react_jsx_runtime.jsxs)("div", { children: [
												(0, react_jsx_runtime.jsx)("span", { children: "Current phase" }),
												(0, react_jsx_runtime.jsx)("strong", { children: task.phase }),
												(0, react_jsx_runtime.jsx)("small", { children: task.finishedAt ? "Finished" : "Ongoing" })
											] })]
										}),
										task.parkReason && task.status === "parked" && (0, react_jsx_runtime.jsxs)("p", {
											className: CaptainPanel_module_css_default.authorization,
											children: [
												"Parked: ",
												task.parkReason,
												". Waiting for a changed prerequisite or human help."
											]
										})
									]
								}),
								!worker && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: CaptainPanel_module_css_default.metrics,
										children: [
											(0, react_jsx_runtime.jsxs)("div", { children: [
												(0, react_jsx_runtime.jsx)("span", { children: "Wall time" }),
												(0, react_jsx_runtime.jsx)("strong", { children: run ? duration(elapsedMs(run.createdAt, run.status === "stopped" ? run.stoppedAt ?? run.updatedAt : void 0, now)) : "—" }),
												(0, react_jsx_runtime.jsx)("small", { children: "Includes waiting & pauses" })
											] }),
											(0, react_jsx_runtime.jsxs)("div", { children: [
												(0, react_jsx_runtime.jsx)("span", { children: "Active tasks / parallel limit" }),
												(0, react_jsx_runtime.jsxs)("strong", { children: [working, (0, react_jsx_runtime.jsxs)("em", { children: [" / ", run?.config.parallelism ?? config.parallelism] })] }),
												(0, react_jsx_runtime.jsxs)("small", { children: [
													merged,
													" merged · ",
													run?.tasks.filter((item) => item.status === "blocked").length ?? 0,
													" blocked · ",
													run?.tasks.filter((item) => item.status === "parked").length ?? 0,
													" parked"
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
												disabled: !allowed.resume || dirty,
												onClick: () => void mutate("resume"),
												title: dirty ? "Save configuration before resuming" : void 0,
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
									dirty && run?.status === "stopped" && (0, react_jsx_runtime.jsx)("p", {
										className: CaptainPanel_module_css_default.controlHint,
										children: "Save your configuration changes before resuming."
									}),
									(0, react_jsx_runtime.jsx)("p", {
										className: CaptainPanel_module_css_default.controlHint,
										children: "Pause holds new dispatch. Drain finishes active tickets. Stop cancels active work. Unresolved blockers park after one hour, preserving work and freeing capacity."
									}),
									run && (0, react_jsx_runtime.jsxs)("section", {
										className: CaptainPanel_module_css_default.card,
										"aria-label": "Live intake policy",
										children: [(0, react_jsx_runtime.jsxs)("div", {
											className: CaptainPanel_module_css_default.sectionTitle,
											children: [(0, react_jsx_runtime.jsx)("h2", { children: "Live intake & review policy" }), (0, react_jsx_runtime.jsx)("span", { children: policyEditable ? "Running or paused coordinator controls" : "Policy changes require a running or paused run" })]
										}), (0, react_jsx_runtime.jsxs)("div", {
											className: CaptainPanel_module_css_default.fields,
											children: [
												(0, react_jsx_runtime.jsxs)("label", {
													className: CaptainPanel_module_css_default.check,
													children: [(0, react_jsx_runtime.jsx)("input", {
														"aria-label": "Live include tickets without a milestone",
														type: "checkbox",
														disabled: !policyEditable,
														checked: policy.includeUnmilestoned,
														onChange: (event) => setPolicyValue("includeUnmilestoned", event.target.checked)
													}), "Include tickets without a milestone"]
												}),
												(0, react_jsx_runtime.jsxs)("label", {
													className: CaptainPanel_module_css_default.check,
													children: [(0, react_jsx_runtime.jsx)("input", {
														"aria-label": "Live include required predecessors outside the selected milestones",
														type: "checkbox",
														disabled: !policyEditable,
														checked: policy.includeRequiredPredecessors,
														onChange: (event) => setPolicyValue("includeRequiredPredecessors", event.target.checked)
													}), "Include required predecessors outside the selected milestones"]
												}),
												(0, react_jsx_runtime.jsxs)("label", { children: [
													"Token budget per OCR review session",
													(0, react_jsx_runtime.jsx)("input", {
														"aria-label": "Live OCR token budget",
														required: true,
														type: "number",
														min: 1,
														step: 1,
														max: MAX_OCR_TOKENS_BUDGET,
														disabled: !policyEditable,
														value: policy.ocrMaxTokensBudget,
														onChange: (event) => setPolicyValue("ocrMaxTokensBudget", Number(event.target.value))
													}),
													(0, react_jsx_runtime.jsx)("small", { children: "Each review has its own budget; no shared pool across workers or the run." })
												] }),
												(0, react_jsx_runtime.jsx)("p", {
													className: CaptainPanel_module_css_default.muted,
													children: "Milestone order sets priority; dependencies still gate dispatch. Intake changes apply to new dispatch. Budget changes apply to future OCR review sessions."
												}),
												(0, react_jsx_runtime.jsx)("button", {
													type: "button",
													disabled: !policyEditable || !validReviewBudget(policy.ocrMaxTokensBudget),
													onClick: () => void mutate("policy"),
													children: "Apply policy"
												})
											]
										})]
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
														(0, react_jsx_runtime.jsx)("td", { children: item.ticket.milestone || "Unassigned" }),
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
									})
								] }),
								task && (0, react_jsx_runtime.jsxs)("section", {
									className: CaptainPanel_module_css_default.card,
									children: [
										(0, react_jsx_runtime.jsxs)("div", {
											className: CaptainPanel_module_css_default.sectionTitle,
											children: [(0, react_jsx_runtime.jsxs)("h2", { children: [task.ticket.id, " · Phase timeline"] }), !worker && (0, react_jsx_runtime.jsx)("button", {
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
										task.workspaceError && (0, react_jsx_runtime.jsx)("p", {
											role: "alert",
											children: task.workspaceError
										}),
										(0, react_jsx_runtime.jsx)(CaptainReviewEvidence, { task }),
										task.parkingError && (0, react_jsx_runtime.jsxs)("p", {
											role: "alert",
											children: [
												"Parking could not quiesce execution: ",
												task.parkingError,
												". Capacity remains reserved."
											]
										}),
										!worker && (task.status === "parked" || task.status === "blocked" || task.status === "running" && task.phase === "waiting") && (0, react_jsx_runtime.jsxs)("form", {
											className: CaptainPanel_module_css_default.fields,
											onSubmit: (event) => {
												event.preventDefault();
												resumeParked(task);
											},
											children: [
												(0, react_jsx_runtime.jsxs)("label", { children: ["Reason to retry (for example, solved)", (0, react_jsx_runtime.jsx)("textarea", {
													required: true,
													value: resumeEvidence,
													onChange: (e) => setResumeEvidence(e.target.value)
												})] }),
												(0, react_jsx_runtime.jsx)("small", { children: "A human Resume authorizes one normal retry. Actual results still determine verification." }),
												(0, react_jsx_runtime.jsx)("button", {
													disabled: busy || run?.status !== "running" || !!task.executionActive || !!task.parkingError || !resumeEvidence.trim(),
													children: task.status === "parked" ? "Resume this parked task" : "Retry this task"
												})
											]
										})
									]
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: CaptainPanel_module_css_default.lowerGrid,
									children: [!worker && (0, react_jsx_runtime.jsxs)("section", {
										className: CaptainPanel_module_css_default.card,
										children: [
											(0, react_jsx_runtime.jsxs)("div", {
												className: CaptainPanel_module_css_default.sectionTitle,
												children: [(0, react_jsx_runtime.jsx)("h2", { children: "Eligibility & dependencies" }), (0, react_jsx_runtime.jsxs)("span", { children: [eligibility.length, " tickets"] })]
											}),
											(0, react_jsx_runtime.jsx)(CaptainEligibilityGraph, {
												tickets: run?.tickets ?? [],
												rows: eligibility
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
												children: [(0, react_jsx_runtime.jsx)("h2", { children: "Blockers & decisions" }), (0, react_jsx_runtime.jsx)("span", { children: "Orchestrator managed" })]
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
														children: question.answer ?? "Orchestrator is preparing an automatic answer…"
													}),
													question.answer && (0, react_jsx_runtime.jsx)("small", { children: question.recordedAt ? "Waiting decision recorded; worker not woken" : question.deliveredAt ? "Delivered to worker" : "Answer queued for delivery" })
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
			});
		}
		//#endregion
		//#region lib/client/captain-index.js
		const inject = [
			"slots",
			"sessions",
			"layout",
			"sidebarRight",
			"sidebarRightTabs"
		];
		const DARKINGDOOM_TAB_KIND = "darkingdoom";
		const DARKINGDOOM_TAB_ID = "@ihab-zhaika/dsh-darkingdoom/dashboard";
		function apply(ctx) {
			const Entry = ({ sessionId }) => (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: CaptainPanel_module_css_default.entry,
				title: "Configure and monitor autonomous ticket delivery",
				onClick: () => {
					ctx.sidebarRight.openTab(DARKINGDOOM_TAB_KIND);
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": true,
					children: "⌁"
				}), "DarKingDoom Plugin"]
			});
			const openSession = async (_parentId, childId) => {
				const workspace = ctx.get("uiWorkspace");
				const sessions = ctx.sessions;
				if (workspace) workspace.openSession(childId);
				else if (sessions.open) sessions.open(childId);
				else throw new Error("Harness does not expose ordinary session navigation");
				ctx.layout.selectPanel?.(null);
			};
			const Surface = ({ sessionId, useTabInfo }) => {
				const info = useTabInfo();
				return (0, react_jsx_runtime.jsx)(CaptainPanel, {
					sessionId,
					workspace: ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd,
					openSession,
					onClose: () => info.tab.actions.close()
				}, sessionId);
			};
			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: DARKINGDOOM_TAB_ID,
				kind: DARKINGDOOM_TAB_KIND,
				keepMounted: true,
				title: () => "DarKingDoom Plugin",
				guide: [{
					id: "darkingdoom-entry",
					order: 30,
					title: () => "DarKingDoom Plugin",
					description: () => "Configure and monitor autonomous delivery in this repository"
				}]
			}));
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "darkingdoom-entry",
				order: 55
			}, Entry));
			ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: DARKINGDOOM_TAB_ID
			}, Surface));
		}
		//#endregion
		exports.DARKINGDOOM_TAB_ID = DARKINGDOOM_TAB_ID;
		exports.DARKINGDOOM_TAB_KIND = DARKINGDOOM_TAB_KIND;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map