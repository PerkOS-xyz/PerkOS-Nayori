export const nayoriWebMcpToolSpecs = [
  {
    name: "nayori_get_capabilities",
    title: "Get Nayori capabilities",
    description:
      "Return Nayori's public networks, contracts, authorization boundaries, and live availability flags. This tool is read-only and never signs a transaction.",
    path: "/.well-known/agent.json",
  },
  {
    name: "nayori_list_agent_skills",
    title: "List Nayori Agent Skills",
    description:
      "Return Nayori's integrity-addressed Agent Skills index. This tool is read-only and helps an agent choose safe product or integration instructions.",
    path: "/.well-known/agent-skills/index.json",
  },
  {
    name: "nayori_get_public_evidence",
    title: "Get Nayori public evidence",
    description:
      "Return Nayori's versioned, read-only mainnet evidence and explicitly attested Milestone 2 adoption counters.",
    path: "/api/evidence.json",
  },
] as const;

export const webMcpInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

/**
 * Register public tools before React hydration so a browser agent sampling at
 * the load event sees the same tools as one arriving later. This covers the
 * current document API and the older navigator surface used by some hosts.
 */
export function webMcpBootstrapScript(): string {
  const specs = JSON.stringify(nayoriWebMcpToolSpecs);
  return `(function(){try{
var d=document.modelContext,n=navigator.modelContext,c=[];
if(d)c.push(d);if(n&&n!==d)c.push(n);if(!c.length)return;
var s=${specs},schema=${JSON.stringify(webMcpInputSchema)};
function tools(legacy){return s.map(function(x){return{name:x.name,title:x.title,description:x.description,inputSchema:schema,
annotations:{readOnlyHint:true,untrustedContentHint:false},execute:function(_a,o){return fetch(x.path,{headers:{accept:"*/*"},signal:o&&o.signal}).then(function(r){if(!r.ok)throw new Error(r.status+" fetching "+x.path);return r.text();}).then(function(body){return legacy?{content:[{type:"text",text:body}]}:body;});}};});}
c.forEach(function(x){if(typeof x.registerTool==="function"){tools(false).forEach(function(t){try{Promise.resolve(x.registerTool(t)).catch(function(){});}catch(e){}});}else if(typeof x.provideContext==="function"){x.provideContext({tools:tools(true)});}});
}catch(e){}})();`;
}
