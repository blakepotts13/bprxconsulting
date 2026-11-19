'use strict';
const $ = id => document.getElementById(id);
const state = {db:null,manifest:null,mode:'all',page:0,total:0,totalGroups:0,perPage:25,rows:[],groups:new Map(),timer:null,selected:null};
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n==null ? 'Not specified' : Number(n).toLocaleString('en-US',{maximumFractionDigits:8});
const siNames={G:'Pass-through drug or biological (OPPS)',K:'Separately payable non-pass-through drug or biological (OPPS)',N:'Packaged into OPPS payment'};
function unitReview(d){const q=Number(d.package_qty);return d.units_item!=null && d.units_ndc!=null && Number.isFinite(q) && Math.abs(d.units_item*q-d.units_ndc)>0.001;}
function siBadge(si){return `<span class="si-badge si-${['G','K','N'].includes(si)?si:si?'other':'missing'}" title="${esc(siNames[si]|| (si?'Other published OPPS indicator':'No matching OPPS indicator in this snapshot'))}">${esc(si||'Not specified')}</span>`;}
function query(sql,params=[]){const statement=state.db.prepare(sql);try{statement.bind(params);const rows=[];while(statement.step())rows.push(statement.getAsObject());return rows;}finally{statement.free();}}
function ndcNormalize(text){const parts=text.trim().split('-');if(parts.length===3&&parts.every(p=>/^\d+$/.test(p))){const sizes=parts.map(p=>p.length).join('-');if(['4-4-2','5-3-2','5-4-1','5-4-2'].includes(sizes))return parts.map((p,i)=>p.padStart([5,4,2][i],'0')).join('');}return text.replace(/[-\s]/g,'');}
function like(s){return '%'+s.replace(/[\\%_]/g,'\\$&')+'%';}
function policyScope(alias='p'){
 const scope=$('scope-filter').value;
 if(scope==='other')return `(${alias}.part_a=0 AND ${alias}.part_b=0)`;
 if(scope==='both')return `(${alias}.part_a=1 OR ${alias}.part_b=1)`;
 return scope==='b'?`${alias}.part_b=1`:`${alias}.part_a=1`;
}
function policyScopeLabel(){return $('scope-filter').selectedOptions[0].text;}
function contractorRows(policyId){return query('SELECT name,number,contract_type,states,status FROM policy_contractors WHERE policy_id=? ORDER BY name,number',[policyId]);}
function contractorList(p){const rows=contractorRows(p.id);return rows.length?`<ul class="contractor-list">${rows.map(c=>`<li><b>${esc(c.name)}</b> · ${esc(c.contract_type)} · ${esc(c.number)}<br><span>${esc(c.states||'State list not supplied')}${c.status!=='A'?' · Contractor status '+esc(c.status):''}</span></li>`).join('')}</ul>`:'<p class="detail-hint">Contractor details were not supplied in the source snapshot.</p>';}

function diagnosisTerm(){const q=$('search').value.trim();return state.mode==='icd'||(state.mode==='all'&&/^[A-TV-Z]\d{2}(?:\.?[A-Z0-9]{0,4})?$/i.test(q)&&! /^[A-Z]\d{4}$/i.test(q));}
const missingSupplementalUnits = "d.mapping_origin='supplemental' AND d.units_item IS NULL";
const unitReviewSql = `(${missingSupplementalUnits}) OR (d.units_item IS NOT NULL AND d.units_ndc IS NOT NULL AND ABS(d.units_item*CAST(d.package_qty AS REAL)-d.units_ndc)>0.001)`;
function conditions(){const q=$('search').value.trim(),mode=state.mode,params=[],clauses=[];const filter=$('status-filter').value;
 if(['G','K','N'].includes(filter)){clauses.push('d.si=?');params.push(filter);}else if(filter==='other')clauses.push("d.si NOT IN ('G','K','N','')");else if(filter==='missing')clauses.push("d.si=''");
 if($('review-filter').value==='units')clauses.push('('+unitReviewSql+')');
 if(q){const tests=[],testParams=[];
  if(mode==='all'||mode==='ndc'){tests.push("d.ndc LIKE ? ESCAPE '\\'");testParams.push(like(ndcNormalize(q)));}
  if(mode==='all'||mode==='hcpcs'){tests.push("d.hcpcs LIKE ? ESCAPE '\\'");testParams.push(like(q.toUpperCase()));}
  if(mode==='all'||mode==='description'){const tokens=q.toLowerCase().split(/\s+/).filter(Boolean);tests.push('('+tokens.map(()=>"(lower(d.drug_name)||' '||lower(d.description)) LIKE ? ESCAPE '\\'").join(' AND ')+')');testParams.push(...tokens.map(like));}
  if(mode==='all'||mode==='icd'){tests.push(`EXISTS(SELECT 1 FROM policy_hcpcs ph JOIN policies p ON p.id=ph.policy_id JOIN diagnosis dx ON dx.policy_id=p.id WHERE ph.hcpcs=d.hcpcs AND ${policyScope()} AND dx.normalized LIKE ? ESCAPE '\\')`);testParams.push(like(q.toUpperCase().replace(/[.\s]/g,'')));}
  clauses.push('('+tests.join(' OR ')+')');params.push(...testParams);
 }
 return {where:clauses.length?'WHERE '+clauses.join(' AND '):'',params};}
function policyCountSql(code){
 return `(SELECT COUNT(DISTINCT p.id) FROM policy_hcpcs ph JOIN policies p ON p.id=ph.policy_id
  WHERE ph.hcpcs=${code} AND ${policyScope()}
  AND EXISTS(SELECT 1 FROM diagnosis dx WHERE dx.policy_id=p.id))`;
}
function fetchMatchingPackages(){
 const {where,params}=conditions();
 const q=$('search').value.trim();
 return query(`SELECT d.*, ${policyCountSql('d.hcpcs')} AS policy_count FROM drugs d ${where}
  ORDER BY CASE WHEN d.ndc=? THEN 0 WHEN d.hcpcs=? THEN 1 ELSE 2 END,
  d.drug_name COLLATE NOCASE,d.hcpcs,d.ndc`,[...params,ndcNormalize(q),q.toUpperCase()]);
}
function loadGroupSummaries(){
 return new Map(query(`
  SELECT hcpcs, MIN(description) AS description, COUNT(DISTINCT ndc) AS ndc_count,
   MAX(mapping_origin='supplemental') AS has_supplemental,
   CASE WHEN COUNT(DISTINCT dosage)>1 THEN 'Varies by package' ELSE MIN(dosage) END AS dosage,
   CASE WHEN COUNT(DISTINCT si)>1 THEN NULL ELSE MIN(si) END AS si
  FROM drugs GROUP BY hcpcs`).map(group=>[group.hcpcs,group]));
}
function fetchGroups(){
 const {where,params}=conditions();
 const q=$('search').value.trim();
 const matches=query(`
  SELECT d.hcpcs, COUNT(*) AS matches, COUNT(DISTINCT d.ndc) AS matched_ndcs,
   MAX(d.ndc=?) AS exact_ndc, SUM(CASE WHEN ${unitReviewSql} THEN 1 ELSE 0 END) AS unit_flags
  FROM drugs d ${where} GROUP BY d.hcpcs`,[ndcNormalize(q),...params]);
 const groups=matches.map(match=>({...state.groups.get(match.hcpcs),...match}));
 groups.sort((a,b)=>b.exact_ndc-a.exact_ndc ||
  Number(b.hcpcs===q.toUpperCase())-Number(a.hcpcs===q.toUpperCase()) ||
  a.description.localeCompare(b.description) || a.hcpcs.localeCompare(b.hcpcs));
 state.total=groups.reduce((total,group)=>total+group.matches,0);
 state.totalGroups=groups.length;
 const visible=groups.slice(state.page*state.perPage,(state.page+1)*state.perPage);
 if(visible.length){
  const counts=new Map(query(`SELECT d.hcpcs, ${policyCountSql('d.hcpcs')} AS policy_count
   FROM drugs d WHERE d.hcpcs IN (${visible.map(()=>'?').join(',')}) GROUP BY d.hcpcs`,
   visible.map(group=>group.hcpcs)).map(row=>[row.hcpcs,row.policy_count]));
  visible.forEach(group=>{group.policy_count=counts.get(group.hcpcs)||0;});
 }
 return visible;
}
function groupLabel(group){
 return `<span class="hcpcs-pill">${esc(group.hcpcs)}</span> <span>${esc(group.description||'Description unavailable')}</span>`;
}
function groupRow(group){
 const code=esc(group.hcpcs);
 const total=group.ndc_count;
 const count=`${fmt(total)} package ${total===1?'ID':'IDs'}`;
 const matches=group.matched_ndcs<total?`<span class="description">${fmt(group.matched_ndcs)} match current filters</span>`:'';
 const flags=group.unit_flags?`<span class="review-tag">${fmt(group.unit_flags)} to review · Check unit conversion</span>`:'';
 const policies=group.policy_count?`<button class="policy-button" data-hcpcs="${code}" data-policies="true">View ICD-10 codes</button><span class="description">${group.policy_count} policy article${group.policy_count===1?'':'s'}</span>`:'<span class="policy-missing">Not identified</span>';
 return `<tr><td><button class="drug-button group-button" data-hcpcs="${code}">${groupLabel(group)}</button>${group.has_supplemental?'<span class="description">Supplemental mapping</span>':''}${flags}</td>
 <td><button class="policy-button" data-hcpcs="${code}" aria-label="View packages for ${code}">${count} ↗</button>${matches}</td>
 <td>${esc(group.dosage||'Not specified')}</td><td>${group.si===null?'Varies':siBadge(group.si)}</td><td>${policies}</td></tr>`;
}
function render(){
 if(!state.db)return;
 state.rows=fetchGroups();
 const groupCount=state.totalGroups;
 $('results-label').textContent=`${fmt(groupCount)} HCPCS ${groupCount===1?'code':'codes'}`;
 const reviewOnly=$('review-filter').value==='units';
 $('review-note').hidden=!reviewOnly;
 const address=new URL(location.href);
 if(reviewOnly)address.searchParams.set('review','units');else address.searchParams.delete('review');
 if($('scope-filter').value!=='a')address.searchParams.set('scope',$('scope-filter').value);else address.searchParams.delete('scope');
 history.replaceState(null,'',address);
 $('scope-note').hidden=$('scope-filter').value!=='other';
 $('scope-note').textContent=`Other contractor—reference only: ${fmt(state.manifest.counts.other_policies)} additional articles are available. These articles do not establish coverage for Illinois. Policy counts and ICD-10 matches below use this selected scope.`;
 const q=$('search').value.trim();
 $('results-subtitle').textContent=`${fmt(state.total)} matching package mapping${state.total===1?'':'s'}${q?` for “${q}”`:''}. Open a code to see all of its packages.`;
 $('results-body').innerHTML=state.rows.map(groupRow).join('');
 $('empty').hidden=groupCount>0;
 $('page-label').textContent=groupCount?`${fmt(state.page*state.perPage+1)}–${fmt(Math.min((state.page+1)*state.perPage,groupCount))} of ${fmt(groupCount)} codes`:'0 results';
 $('prev').disabled=state.page===0;
 $('next').disabled=(state.page+1)*state.perPage>=groupCount;
 $('export').disabled=!state.total;
 let note='';
 if(q&&diagnosisTerm())note='ICD-10 search finds drugs whose HCPCS codes are co-listed in an article within the selected policy scope containing this diagnosis. A result is a policy reference, not confirmation that every listed drug is covered for the diagnosis. Review the separate code groups.';
 if((state.mode==='ndc'||state.mode==='all')&&/^\d{10}$/.test(q))note='This unhyphenated 10-digit NDC is ambiguous. Enter its original hyphens (4-4-2, 5-3-2 or 5-4-1), or use the 11-digit billing NDC. Leading zeros are preserved.';
 $('search-note').textContent=note;
 $('search-note').hidden=!note;
}
function resetPage(){state.page=0;render();}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,2200);}
function policyUrl(p){return `https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleid=${encodeURIComponent(p.id)}&ver=${encodeURIComponent(p.version)}`;}
function policyCards(d,expand=false){const policies=query(`SELECT DISTINCT p.* FROM policies p JOIN policy_hcpcs ph ON ph.policy_id=p.id WHERE ph.hcpcs=? AND ${policyScope()} ORDER BY p.title`,[d.hcpcs]);
 if(!policies.length)return `<div class="inline-empty">No current matching policy article was identified for ${esc(policyScopeLabel())} in this snapshot. Coverage may depend on other policies or documentation. This does not establish noncoverage.</div>`;
 return policies.map(p=>{const groups=query('SELECT * FROM policy_groups WHERE policy_id=? ORDER BY kind,CAST(group_no AS INTEGER)',[p.id]);const dxTotal=query('SELECT COUNT(*) AS n FROM diagnosis WHERE policy_id=?',[p.id])[0].n;
 const dxGroups=groups.filter(g=>g.kind==='icd');const hg=groups.filter(g=>g.kind==='hcpcs'&&query('SELECT 1 FROM policy_hcpcs WHERE policy_id=? AND hcpcs=? AND group_no=?',[p.id,d.hcpcs,g.group_no]).length);
 return `<article class="policy-card"><div class="policy-label">A${esc(p.id)} · VERSION ${esc(p.version)}</div>${p.part_a||p.part_b?'<span class="jurisdiction-badge">NGS J6 · Illinois</span>':'<span class="jurisdiction-badge reference-badge">Other contractor—reference only</span>'}<h4>${esc(p.title.replace(/^Billing and Coding:\s*/,''))}</h4><div class="policy-meta">${p.part_a||p.part_b?[p.part_a?'Part A':'',p.part_b?'Part B':''].filter(Boolean).join(' + '):'Other Medicare contractor'} · Effective ${esc(p.effective)} · Updated ${esc(p.updated)}${p.cah_listed?' · CAH bill type listed':''}</div>${contractorList(p)}${p.part_a||p.part_b?'':'<p class="reference-warning">Reference only. This article belongs to another contractor and does not establish Illinois coverage.</p>'}<p class="detail-hint">${fmt(dxTotal)} diagnosis code listings in this article. Indication, product, route and code-group restrictions may apply.</p><a class="source-link" href="${policyUrl(p)}" target="_blank" rel="noopener noreferrer">Open complete CMS policy ↗</a>${hg.map(g=>`<details><summary>HCPCS group ${esc(g.group_no)} · ${esc(d.hcpcs)}</summary><p class="group-note">${esc(g.note||'No additional group note supplied. Review the complete policy.')}</p></details>`).join('')}${dxGroups.map((g,index)=>{const codes=query('SELECT code,description,asterisk FROM diagnosis WHERE policy_id=? AND group_no=? ORDER BY sort_order,code',[p.id,g.group_no]);if(!codes.length)return '';return `<details ${expand&&index===0?'open':''}><summary>ICD-10 group ${esc(g.group_no)} · ${fmt(codes.length)} code${codes.length===1?'':'s'}</summary><p class="group-note">${esc(g.note||'No additional group note supplied. Review the complete policy.')}</p><p class="detail-hint">Group numbers are independent of HCPCS group numbers. An asterisk denotes a policy-specific condition.</p><div class="dx-list">${codes.map(x=>`<div class="dx-item"><span class="mono">${esc(x.code)}${x.asterisk==='Y'?'*':''}</span><span>${esc(x.description)}</span></div>`).join('')}</div></details>`;}).join('')}</article>`;
 }).join('');}
function allowableUnitDiff(d,a){return !!(a?.billing_unit&&d.dosage&&a.billing_unit.replace(/\s/g,'').toUpperCase()!==d.dosage.replace(/\s/g,'').toUpperCase());}
function allowableCard(d){
 const a=query('SELECT * FROM medicare_allowables WHERE hcpcs=?',[d.hcpcs])[0];
 const source=state.manifest.sources.allowables;
 const amount=a?.amount_text==null?'No numeric amount published':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:8}).format(Number(a.amount_text));
 return `<section class="allowable-card" aria-labelledby="allowable-title"><h3 id="allowable-title">Medicare Allowable</h3><p class="allowable-amount">${esc(amount)}</p>${a?.billing_unit?`<p class="allowable-unit">Per ${esc(a.billing_unit)} · one HCPCS billing unit</p>`:''}<p class="detail-hint">${esc(source.quarter)} · ${esc(source.effective)} through ${esc(source.effective_end)}</p>${a?.amount_text==null?'<p class="detail-hint">A numeric rate is not available in this quarter’s CMS file. This does not mean $0 or establish noncoverage.</p>':''}${allowableUnitDiff(d,a)?`<p class="unit-warning allowable-unit-warning"><b>Billing-unit descriptions differ between CMS files.</b> Pricing file: ${esc(a.billing_unit)}. Crosswalk: ${esc(d.dosage)}. Verify equivalence before applying this rate to quantities.</p>`:''}${a?.notes?`<p class="allowable-note"><b>CMS pricing note:</b> ${esc(a.notes)}</p>`:''}${a?.ndra_manufacturers?`<p class="unit-warning"><b>CMS manufacturer restriction:</b> This HCPCS appears in the quarter’s Part B nonpayment list for manufacturers without a Medicaid National Drug Rebate Agreement: ${esc(a.ndra_manufacturers)}. Verify the manufacturer and NDC before use.</p>`:''}<p class="detail-hint">Published CMS Part B benchmark, including applicable add-ons; not raw ASP. This is not a coverage determination or a CAH reimbursement estimate. CAH facility payment generally follows reasonable-cost rules.</p><a class="source-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">CMS quarterly pricing source ↗</a></section>`;
}
let historyRequest;
function loadHcpcsHistory(){
 if(!historyRequest){
  historyRequest=fetch('hcpcs-history.json',{cache:'no-store',credentials:'same-origin'}).then(async response=>{
   if(!response.ok)throw Error('History request failed');
   const data=await response.json();
   if(!data.items||!data.decisions||!Array.isArray(data.sources)||!data.sources.length)throw Error('Invalid history data');
   return data;
  }).catch(error=>{historyRequest=null;throw error;});
 }
 return historyRequest;
}
function historySource(url,label){
 try{
  const source=new URL(url);
  if(source.origin!=='https://www.cms.gov')return '';
  return `<a class="source-link" href="${esc(source.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
 }catch{return '';}
}
function historyQuarter(source){
 return source.quarter.replace(/^(\d{4})-Q([1-4])$/,'Q$2 $1');
}
async function renderHcpcsHistory(drug,panel){
 try{
  const data=await loadHcpcsHistory();
  if(!panel.isConnected)return;
  const exactNdc=/^\d{11}$/.test(drug.ndc);
  const ranges=exactNdc?data.items[drug.ndc]||[]:[];
  const decision=data.decisions[drug.hcpcs];
  const latestIndex=data.sources.length-1;
  const timeline=[...ranges].sort((a,b)=>b[1]-a[1]||b[0]-a[0]||a[2].localeCompare(b[2]));
  const mappedCodes=new Set(timeline.map(row=>row[2]));
  let summary;
  if(!exactNdc)summary='This record uses an alternate identifier. Exact-NDC history is unavailable.';
  else if(!timeline.length)summary='CMS crosswalks did not list this exact NDC in the quarters reviewed.';
  else if(mappedCodes.size===1&&mappedCodes.has(drug.hcpcs))summary=`CMS listed ${drug.hcpcs} for this NDC in the quarters shown.`;
  else summary='These are the HCPCS codes CMS listed for this exact NDC, most recent first.';
  panel.innerHTML=`
   <h3 class="section-title" id="hcpcs-history-title">HCPCS history</h3>
   <p class="history-current"><b>${drug.mapping_origin==='supplemental'?'Supplemental lookup:':'Current lookup:'}</b> <span class="hcpcs-pill">${esc(drug.hcpcs)}</span> <b>${esc(drug.dosage||'Billing unit unspecified')}</b> per billing unit</p>
   <h4>Same NDC${exactNdc?` · ${esc(drug.ndc_display)}`:''}</h4>
   <p class="detail-hint">${esc(summary)}</p>
   ${timeline.length?`<div class="history-scroll"><table class="history-table"><thead><tr><th scope="col">HCPCS</th><th scope="col">Per billing unit</th><th scope="col">Listed quarters</th><th scope="col">CMS crosswalk</th></tr></thead><tbody>${timeline.map(([first,last,code,unit])=>{
    const from=data.sources[first],to=data.sources[last];
    return `<tr><th scope="row"><span class="hcpcs-pill">${esc(code)}</span>${last===latestIndex&&code===drug.hcpcs?' <span class="history-current-tag">Current code</span>':''}</th><td>${esc(unit||'Not specified')}</td><td>${esc(historyQuarter(from))}${first===last?'':`–${esc(historyQuarter(to))}`}</td><td>${historySource(from.url,historyQuarter(from))}${first===last?'':` · ${historySource(to.url,historyQuarter(to))}`}</td></tr>`;
   }).join('')}</tbody></table></div>`:''}
   ${decision?`<aside class="history-decision"><h4>CMS coding change · ${esc(decision.formulation)}</h4><p>CMS added <b>${esc(drug.hcpcs)} (per ${esc(decision.unit)})</b> effective ${esc(decision.effective)}. The prior formulation codes below were discontinued as of ${esc(decision.retired)}.</p><ul>${decision.prior.map(([code,unit])=>`<li><b>${esc(code)}</b> · per ${esc(unit)}</li>`).join('')}</ul><p>These codes cover the formulation. Use the same-NDC rows above to see which code CMS listed for this package.</p>${historySource(decision.source,'CMS April 2024 coding update')}</aside>`:''}
   <p class="detail-hint">Crosswalk coverage: ${esc(historyQuarter(data.sources[0]))}–${esc(historyQuarter(data.sources[latestIndex]))}. Gaps indicate quarters without a matching listing in these files. Use the applicable source for the date of service.</p>`;
 }catch{
  if(panel.isConnected)panel.innerHTML='<h3 class="section-title" id="hcpcs-history-title">HCPCS history</h3><p class="detail-hint">Could not load HCPCS history. Close and reopen this record to retry.</p>';
 }
}
function packagesForGroup(code){
 const {where,params}=conditions();
 const q=$('search').value.trim();
 const expression=where?where.slice('WHERE '.length):'1';
 return query(`SELECT d.*, CASE WHEN ${expression} THEN 1 ELSE 0 END AS matches_search
 FROM drugs d WHERE d.hcpcs=?
 ORDER BY (d.ndc=?) DESC, matches_search DESC, d.drug_name COLLATE NOCASE, d.ndc, d.id`,
 [...params,code,ndcNormalize(q)]);
}
function packageMatches(p,value){
 const tokens=value.toLowerCase().split(/\s+/).filter(Boolean);
 const name=`${p.drug_name} ${p.labeler||''} ${p.ndc_display}`.toLowerCase();
 const ndc=ndcNormalize(value);
 return !!(ndc&&p.ndc.includes(ndc)) || tokens.every(token=>name.includes(token));
}
function packageListRow(p,showMatches){
 return `<li class="package-row">
  <button class="package-open" data-package-id="${p.id}">
   <span class="package-name"><b>${esc(p.drug_name)}</b><span>${esc(p.labeler)}</span></span>
   <span class="package-ndc"><span class="mono">${esc(p.ndc_display)}</span>
    ${showMatches&&p.matches_search?'<span class="package-match">Matches current filters</span>':''}
    ${unitReview(p)?'<span class="review-tag">Check unit conversion</span>':''}
   </span>
   <span class="package-units">${p.mapping_origin==='supplemental'&&p.units_item==null?'Billing units need label review':`<b>${esc(fmt(p.units_item))}</b> HCPCS units per item`}</span>
   <span aria-hidden="true" class="package-arrow">↗</span>
  </button></li>`;
}
function openGroup(code,policies=false){
 const group=state.groups.get(code);
 if(!group)return;
 const packages=packagesForGroup(code);
 const hasSubset=packages.some(p=>!p.matches_search);
 $('group-content').innerHTML=`
  <h2 id="group-title">${groupLabel(group)}</h2>
  <details class="group-policies"${policies?' open':''}>
   <summary id="group-policy-title">ICD-10 policy references</summary>
   <p class="detail-hint">Policy co-listings for ${esc(code)} in ${esc(policyScopeLabel())}.</p>
   <div id="group-policy-content">${policies?policyCards(group,true):''}</div>
  </details>
  <section aria-labelledby="group-packages-title">
   <h3 class="section-title" id="group-packages-title">NDC packages</h3>
   ${group.has_supplemental?'<p class="detail-hint">Supplemental J1815 matches come from the supplied reference. Confirm the administration method before choosing a code.</p>':''}
   <label class="sr-only" for="package-search">Search packages by NDC, drug name, or manufacturer</label>
   <input id="package-search" class="package-search" type="search" autocomplete="off" spellcheck="false" maxlength="120" placeholder="Search NDC, drug name, or manufacturer">
   <div class="package-toolbar"><p class="detail-hint" id="package-count" aria-live="polite"></p><button type="button" class="text-button" id="clear-package-search" hidden>Clear search</button></div>
   ${hasSubset?'<p class="detail-hint">Packages matching the main search and filters appear first.</p>':''}
   <p class="detail-hint" id="package-ambiguous" hidden>Enter a 10-digit NDC with its original hyphens, or use the 11-digit billing NDC.</p>
   <ul class="package-list" id="package-list"></ul>
   <p class="inline-empty" id="package-empty" hidden>No packages match. Try another NDC, drug name, or manufacturer.</p>
  </section>
`;
 const policyContent=$('group-policy-content');
 policyContent.closest('details').addEventListener('toggle',event=>{
  if(event.currentTarget.open&&!policyContent.hasChildNodes())policyContent.innerHTML=policyCards(group);
 });
 const input=$('package-search');
 const clear=$('clear-package-search');
 const list=$('package-list');
 function renderPackages(){
  const value=input.value.trim();
  const visible=packages.filter(p=>packageMatches(p,value));
  $('package-count').textContent=`${fmt(visible.length)} of ${fmt(packages.length)} packages`;
  $('package-empty').hidden=!!visible.length;
  $('package-ambiguous').hidden=!/^\d{10}$/.test(value);
  clear.hidden=!value;
  list.innerHTML=visible.map(p=>packageListRow(p,hasSubset)).join('');
 }
 input.addEventListener('input',renderPackages);
 clear.addEventListener('click',()=>{input.value='';renderPackages();input.focus();});
 list.addEventListener('click',event=>{
  const button=event.target.closest('[data-package-id]');
  if(button)openDetail(Number(button.dataset.packageId));
 });
 renderPackages();
 $('group-dialog').showModal();
 if(policies)$('group-policy-title').focus();
}
function supplementalNotice(d){
 if(d.mapping_origin!=='supplemental')return '';
 const cmsCodes=query("SELECT DISTINCT hcpcs FROM drugs WHERE ndc=? AND mapping_origin='cms' ORDER BY hcpcs",[d.ndc]).map(row=>row.hcpcs);
 const other=cmsCodes.length?` CMS also lists this NDC under ${esc(cmsCodes.join(', '))}.`:'';
 return `<aside class="unit-warning"><b>Supplemental J1815 match.</b>${other} Confirm how the insulin was administered before choosing a code.${d.units_item==null?' Verify the exact package label to calculate billing units.':''}</aside>`;
}
function openDetail(id,policies=false){const d=query('SELECT * FROM drugs WHERE id=?',[id])[0];if(!d)return;state.selected=d;
 $('detail-content').innerHTML=`<h2>${esc(d.drug_name)}</h2><div class="subline">${esc(d.description)} · ${esc(d.labeler)}</div><div class="detail-codebar"><span class="mono">${esc(d.ndc_display)}</span><button id="copy-ndc" class="secondary-button">Copy NDC</button><span class="hcpcs-pill">${esc(d.hcpcs)}</span>${siBadge(d.si)}</div>${supplementalNotice(d)}${unitReview(d)?'<aside class="unit-warning"><b>Source conversion needs review.</b> CMS billing units per item × package quantity do not equal the published units per NDC pack. Both source values are preserved. Confirm the package and billing conversion before use.</aside>':''}${/^\d{11}$/.test(d.ndc)?'':'<aside class="unit-warning">This source record uses an alternate identifier rather than an 11-digit NDC. Verify the package NDC before using it in a build.</aside>'}${allowableCard(d)}<div class="detail-grid"><div><small>HCPCS billing unit</small><b>${esc(d.dosage||'Not specified')}</b></div><div><small>Billing units per item</small><b>${fmt(d.units_item)}</b></div><div><small>Billing units per NDC pack</small><b>${fmt(d.units_ndc)}</b></div><div><small>${d.mapping_origin==='supplemental'?'Product volume per item':'CMS package size'}</small><b>${esc(d.package_size||'Not specified')}</b></div><div><small>Items per NDC pack</small><b>${esc(d.package_qty||'Not specified')}</b></div><div><small>Reference period</small><b>Oct–Dec 2026</b></div></div><p class="detail-hint">Billing units are HCPCS units, not NDC reporting units. ${d.mapping_origin==='supplemental'?'Where FDA package data are available, units are calculated from insulin concentration × volume ÷ 5.':'Package size is reproduced from CMS and its unit is not independently verified here.'} Confirm the exact product label and local charge conversion before building.</p><p class="detail-hint"><b>OPPS indicator ${esc(d.si||'not specified')}:</b> ${esc(siNames[d.si]||'Review the published CMS indicator definition.')} This indicator does not determine CAH payment or JW/JZ eligibility.</p><section class="hcpcs-history" id="hcpcs-history" aria-labelledby="hcpcs-history-title"><h3 class="section-title" id="hcpcs-history-title">HCPCS history</h3><p class="detail-hint" role="status">Loading CMS crosswalk history…</p></section><h3 class="section-title" id="detail-policies">ICD-10 policy references</h3><p class="detail-hint">Policy co-listings for ${esc(d.hcpcs)} in ${esc($('scope-filter').selectedOptions[0].text)}. These are not validated drug–diagnosis pairings. Review the indication and both code-group notes.</p>${policyCards(d,policies)}<h3 class="section-title">Mapping source</h3><p class="detail-hint">${JSON.parse(d.source).map(esc).join('<br>')}</p>${d.mapping_origin==='supplemental'?historySource(state.manifest.sources.opps.url,'CMS OPPS status indicator')+` <a class="source-link" href="${FormularyData.FDA_DIRECTORY}" target="_blank" rel="noopener noreferrer">FDA NDC Directory ↗</a>`:`<a class="source-link" href="${esc(state.manifest.sources.crosswalk.url)}" target="_blank" rel="noopener noreferrer">Download original CMS crosswalk ↗</a>`}`;
 $('copy-ndc').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(d.ndc);toast('Billing NDC copied');}catch{toast('Copy unavailable; select the displayed NDC.');}});
 $('detail-dialog').showModal();const historyReady=renderHcpcsHistory(d,$('hcpcs-history'));if(policies){const active=d.id;historyReady.then(()=>{if(state.selected?.id===active&&$('detail-dialog').open)$('detail-policies').scrollIntoView({block:'start'});});}
}
function sources(){const m=state.manifest;if(!m){toast('Reference data is still loading.');return;}$('source-content').innerHTML=`<h2>Know where the data comes from.</h2><p class="detail-hint">This reference uses official CMS downloads. It also includes supplemental J1815 mappings from a supplied reference, with billing units calculated from FDA package data where available. Searches run in your browser. No patient information is needed.</p><div class="source-entry"><h3>NDC–HCPCS & billing units</h3><p>October 2026 crosswalk · Effective Oct 1–Dec 31, 2026. ASP, OPPS and PrEP files; applicable Level II rows only.</p><a class="source-link" href="${esc(m.sources.crosswalk.url)}" target="_blank" rel="noopener noreferrer">Original crosswalk ZIP ↗</a></div><div class="source-entry"><h3>Medicare Allowable</h3><p>${esc(m.sources.allowables.quarter)} · ${esc(m.sources.allowables.effective)} through ${esc(m.sources.allowables.effective_end)}. Published CMS Part B amounts per HCPCS billing unit for ${fmt(m.counts.allowable_hcpcs)} mapped codes (${fmt(m.counts.allowable_packages)} package mappings). Applicable add-ons are already included; amounts are not raw ASP. CMS notes and manufacturer-specific NDRA restrictions are retained. Missing amounts are not zero and do not establish noncoverage.</p><a class="source-link" href="${esc(m.sources.allowables.url)}" target="_blank" rel="noopener noreferrer">CMS quarterly pricing ZIP ↗</a><p><a class="source-link" href="https://www.cms.gov/files/document/mln006400-information-critical-access-hospitals.pdf" target="_blank" rel="noopener noreferrer">CMS CAH payment guidance ↗</a></p></div><div class="source-entry"><h3>OPPS status indicators</h3><p>October 2026 Addendum B · Updated Oct 15, 2026. Other published status indicators are preserved rather than converted to “not specified.”</p><a class="source-link" href="https://www.cms.gov/medicare/payment/prospective-payment-systems/hospital-outpatient-pps/quarterly-addenda-updates/october-2026-addendum-b" target="_blank" rel="noopener noreferrer">CMS Addendum B source ↗</a></div><div class="source-entry"><h3>HCPCS history</h3><p>Archived CMS crosswalks show which code and billing unit were listed for the same 11-digit NDC. The quarter links in each item open the underlying CMS ZIPs.</p><a class="source-link" href="https://www.cms.gov/medicare/payment/part-b-drugs/asp-pricing-files" target="_blank" rel="noopener noreferrer">CMS crosswalk archive ↗</a></div><div class="source-entry"><h3>ICD-10 policy references</h3><p>Current article download · Data as of ${esc(m.policy_snapshot)} · Released ${esc(m.policy_release)}. ${fmt(m.counts.policies)} current Medicare contractor articles listing mapped HCPCS: ${fmt(m.counts.ngs_policies)} NGS J6 Illinois articles and ${fmt(m.counts.other_policies)} other-contractor articles. NGS Part A (06101) is the default; other-contractor articles are reference only.</p><a class="source-link" href="https://www.cms.gov/medicare-coverage-database/downloads/downloads.aspx" target="_blank" rel="noopener noreferrer">Medicare Coverage Database downloads ↗</a></div><h3 class="section-title">Coverage & limitations</h3><ul class="limits">${m.limitations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="detail-hint">This is a reference prototype for review, not an approved formulary build or claims adjudication tool. A policy code’s presence does not replace medical necessity and documentation requirements.</p><p class="detail-hint">Snapshot assembled ${esc(m.as_of)}. Updates are manual; no recurring refresh has been configured.</p><a href="manifest.json" download class="source-link">Download source manifest</a> <span class="muted">·</span> <button type="button" id="download-database" class="text-button source-link">Download SQLite database</button>`;$('download-database').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([state.db.export()],{type:'application/vnd.sqlite3'}));const link=document.createElement('a');link.href=url;link.download='formulary-reference-2026-Q4.sqlite';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});$('source-dialog').showModal();}
function exportCsv(){const rows=fetchMatchingPackages();const prices=new Map(query('SELECT * FROM medicare_allowables').map(a=>[a.hcpcs,a]));const pricing=state.manifest.sources.allowables;const headers=['NDC','Drug name','Description','HCPCS','HCPCS dosage per billing unit','Billing units per item','Billing units per NDC pack','Package size per item','Package quantity','OPPS status indicator','Unit review required','Selected policy scope','Medicare article references (not validated diagnosis pairings)','Article contractors','Mapping source','Period','Medicare Allowable (USD per HCPCS billing unit; not a CAH reimbursement estimate)','Medicare Allowable billing unit','Medicare Allowable effective start','Medicare Allowable effective end','CMS pricing notes','CMS NDRA manufacturer restrictions','Medicare Allowable source','CMS billing-unit descriptions differ'];const csvField=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const text=[headers,...rows.map(d=>[d.ndc_display,d.drug_name,d.description,d.hcpcs,d.dosage,d.units_item,d.units_ndc,d.package_size,d.package_qty,d.si||'Not specified',d.mapping_origin==='supplemental'&&d.units_item==null?'YES — verify exact package label':unitReview(d)?'YES — source arithmetic needs review':'No arithmetic discrepancy identified',policyScopeLabel(),query(`SELECT DISTINCT p.id FROM policies p JOIN policy_hcpcs ph ON ph.policy_id=p.id WHERE ph.hcpcs=? AND ${policyScope()}`,[d.hcpcs]).map(p=>'A'+p.id).join('; '),query(`SELECT DISTINCT p.id FROM policies p JOIN policy_hcpcs ph ON ph.policy_id=p.id WHERE ph.hcpcs=? AND ${policyScope()}`,[d.hcpcs]).map(p=>'A'+p.id+': '+contractorRows(p.id).map(c=>c.name+' / '+c.number+' / '+c.contract_type+' / '+c.states).join(' | ')).join('; '),JSON.parse(d.source).join('; '),'2026-10-01 through 2026-12-31',prices.get(d.hcpcs)?.amount_text??'Not published',prices.get(d.hcpcs)?.billing_unit||'Not specified',pricing.effective,pricing.effective_end,prices.get(d.hcpcs)?.notes||'',prices.get(d.hcpcs)?.ndra_manufacturers||'',pricing.url,allowableUnitDiff(d,prices.get(d.hcpcs))?'Yes — verify unit equivalence':'No'])].map(row=>row.map(csvField).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=$('review-filter').value==='units'?'formulary-unit-review-2026-Q4.csv':'formulary-reference-2026-Q4.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`Exported ${fmt(rows.length)} mappings`);}
async function init(){try{const [SQL,m]=await Promise.all([initSqlJs({locateFile:f=>'vendor/'+f}),fetch('manifest.json?v=private-1',{cache:'no-store',credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error('Sign in with an approved account to load the reference.');return r.json();})]);state.db=await FormularyData.openDatabase(SQL,m);state.manifest=m;state.groups=loadGroupSummaries();['search','status-filter','scope-filter','review-filter'].forEach(id=>$(id).disabled=false);const reviewCount=query('SELECT COUNT(*) AS n FROM drugs d WHERE '+unitReviewSql)[0].n;$('review-filter').options[1].textContent=`Needs unit review (${fmt(reviewCount)})`;$('summary-strip').innerHTML=`<div><b>${fmt(query('SELECT COUNT(*) AS n FROM drugs')[0].n)}</b><span>package mappings</span></div><div><b>${fmt(state.groups.size)}</b><span>HCPCS codes</span></div><div><b>${fmt(m.counts.policies)}</b><span>Medicare articles · ${fmt(m.counts.ngs_policies)} NGS / ${fmt(m.counts.other_policies)} other</span></div><div><b>Source data</b><span>Source links with every record</span></div>`;const url=new URL(location.href);if(['a','b','both','other'].includes(url.searchParams.get('scope')))$('scope-filter').value=url.searchParams.get('scope');if(url.searchParams.get('review')==='units')$('review-filter').value='units';if(url.searchParams.has('q'))$('search').value=url.searchParams.get('q');render();}catch(e){$('results-label').textContent='Reference data could not load';$('load-error').hidden=false;$('load-error').textContent='Please reload the page. If the problem continues, the database or SQLite engine may be unavailable. '+e.message;$('results-body').innerHTML='';}}
$('search').addEventListener('input',()=>{clearTimeout(state.timer);state.timer=setTimeout(resetPage,180);});document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});resetPage();}));['status-filter','scope-filter','review-filter'].forEach(id=>$(id).addEventListener('change',resetPage));$('reset').addEventListener('click',()=>{$('search').value='';$('status-filter').value='';$('scope-filter').value='a';$('review-filter').value='';state.mode='all';document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode==='all');b.setAttribute('aria-pressed',String(b.dataset.mode==='all'));});resetPage();});$('results-body').addEventListener('click',e=>{const b=e.target.closest('[data-hcpcs]');if(b)openGroup(b.dataset.hcpcs,b.dataset.policies==='true');});$('prev').addEventListener('click',()=>{state.page--;render();});$('next').addEventListener('click',()=>{state.page++;render();});$('export').addEventListener('click',exportCsv);['sources-button','footer-sources'].forEach(id=>$(id).addEventListener('click',sources));$('close-group').addEventListener('click',()=>$('group-dialog').close());$('close-detail').addEventListener('click',()=>$('detail-dialog').close());$('close-sources').addEventListener('click',()=>$('source-dialog').close());for(const id of ['group-dialog','detail-dialog','source-dialog'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('search').focus();}});init();
