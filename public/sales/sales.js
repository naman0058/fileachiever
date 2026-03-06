async function api(url, payload){
  const resp = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload || {})
  });
  const data = await resp.json().catch(()=>({ ok:false, message:'Invalid JSON' }));
  if (!data.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function toast(msg){
  const t = document.createElement('div');
  t.innerText = msg;
  t.style.position='fixed';
  t.style.bottom='16px';
  t.style.right='16px';
  t.style.background='#0f172a';
  t.style.color='#fff';
  t.style.padding='10px 12px';
  t.style.borderRadius='12px';
  t.style.zIndex=999999;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1200);
}

async function copyText(text){
  if(!text) return;
  try{ await navigator.clipboard.writeText(text); toast('Copied'); }
  catch{
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied');
  }
}

// ------------------ Stage ------------------
async function setStage(assignmentId, stage){
  try{
    await api('/sales/api/assignment/stage', { assignment_id: assignmentId, stage });
    toast('Stage updated');
    location.reload();
  }catch(e){
    alert('Stage update failed: ' + e.message);
  }
}

// ------------------ Reject ------------------
async function rejectAssignment(assignmentId){
  const reason = prompt('Reject reason (optional):') || '';
  try{
    await api('/sales/api/assignment/reject', { assignment_id: assignmentId, reason });
    toast('Rejected');
    location.reload();
  }catch(e){
    alert('Reject failed: ' + e.message);
  }
}

// ------------------ Logs ------------------
function openLogs(assignmentId, leadName){
  document.getElementById('logsAssignmentId').value = assignmentId;
  document.getElementById('logsTitle').innerText = 'Call Logs • ' + (leadName || 'Lead');
  document.getElementById('logsNote').value = '';
  document.getElementById('logsNextDate').value = '';
  document.getElementById('logsTimeline').innerHTML = '';
  document.getElementById('logsBack').style.display = 'flex';
  loadLogs(assignmentId);
}
function closeLogs(){
  document.getElementById('logsBack').style.display = 'none';
}

async function loadLogs(assignmentId){
  try{
    const resp = await fetch('/sales/api/assignment/calls/' + assignmentId);
    const data = await resp.json();
    if(!data.ok) throw new Error(data.message || 'Failed');

    const box = document.getElementById('logsTimeline');
    if(!data.rows.length){
      box.innerHTML = `<div class="trow"><div class="tNote">No call logs yet.</div></div>`;
      return;
    }
    box.innerHTML = data.rows.map(r=>{
      const dt = new Date(r.created_at).toLocaleString();
      const next = r.next_followup_date ? (' • Next: ' + r.next_followup_date) : '';
      return `
        <div class="trow">
          <div class="tTop">
            <div class="tDay">${escapeHtml(r.day_label)}</div>
            <div class="tDate">${dt}${next}</div>
          </div>
          <div class="tNote">${escapeHtml(r.note)}</div>
        </div>
      `;
    }).join('');
  }catch(e){
    alert('Load logs failed: ' + e.message);
  }
}

async function addLog(){
  const assignmentId = document.getElementById('logsAssignmentId').value;
  const note = document.getElementById('logsNote').value.trim();
  const next_followup_date = document.getElementById('logsNextDate').value || null;
  if(!note){ alert('Note required'); return; }

  try{
    await api('/sales/api/assignment/calls', { assignment_id: assignmentId, note, next_followup_date });
    toast('Saved');
    document.getElementById('logsNote').value = '';
    document.getElementById('logsNextDate').value = '';
    await loadLogs(assignmentId);
    setTimeout(()=>location.reload(), 300);
  }catch(e){
    alert('Add log failed: ' + e.message);
  }
}

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

// ------------------ Convert ------------------
function openConvert(assignmentId, leadName){
  document.getElementById('convertAssignmentId').value = assignmentId;
  document.getElementById('convertTitle').innerText = 'Convert • ' + (leadName || 'Lead');

  document.getElementById('convertLeadPrice').value = '';
  document.getElementById('convertAgentPrice').value = '';
  document.getElementById('convertDeadline').value = '';
  document.getElementById('convertAssign').value = '';
  document.getElementById('convertAdvance').value = '';
  document.getElementById('convertPakPrice').value = '';
  document.getElementById('convertSheetUid').value = '';
  document.getElementById('convertRemarks').value = '';

  document.getElementById('convertBack').style.display = 'flex';
}
function closeConvert(){
  document.getElementById('convertBack').style.display = 'none';
}

async function doConvert(){
  const assignment_id = document.getElementById('convertAssignmentId').value;
  const lead_price = document.getElementById('convertLeadPrice').value;
  const agent_price = document.getElementById('convertAgentPrice').value;

  if(lead_price === '' || Number(lead_price) < 0){ alert('Lead Price required'); return; }
  if(agent_price === '' || Number(agent_price) < 0){ alert('Agent Price required'); return; }

  const payload = {
    assignment_id,
    lead_price,
    agent_price,
    deadline: document.getElementById('convertDeadline').value || null,
    assign: document.getElementById('convertAssign').value || null,
    advance_amount: document.getElementById('convertAdvance').value || null,
    pakistani_price: document.getElementById('convertPakPrice').value || null,
    sheet_uid: document.getElementById('convertSheetUid').value || null,
    remarks: document.getElementById('convertRemarks').value || null,
  };

  try{
    await api('/sales/api/assignment/convert', payload);
    toast('Converted');
    closeConvert();
    location.reload();
  }catch(e){
    alert('Convert failed: ' + e.message);
  }
}

// ------------------ Admin: Assign More ------------------
function openAssignMore(leadId){
  const back = document.getElementById('assignBack');
  if(!back) return;
  document.getElementById('assignLeadId').value = leadId;
  back.style.display = 'flex';
}
function closeAssign(){
  const back = document.getElementById('assignBack');
  if(back) back.style.display = 'none';
}
async function saveAssign(){
  const lead_id = document.getElementById('assignLeadId').value;
  const sel = document.getElementById('assignUsers');
  const user_ids = Array.from(sel.selectedOptions).map(o => Number(o.value)).filter(Number.isFinite);
  if(!user_ids.length){ alert('Select at least 1 agent'); return; }
  try{
    await api('/sales/api/admin/assign', { lead_id, user_ids });
    toast('Assigned');
    closeAssign();
    location.reload();
  }catch(e){
    alert('Assign failed: ' + e.message);
  }
}

// ------------------ Admin: Edit Lead ------------------
function openEditLead(leadId){
  const back = document.getElementById('editBack');
  if(!back) return;
  document.getElementById('editLeadId').value = leadId;
  back.style.display = 'flex';
  loadLead(leadId);
}
function closeEdit(){
  const back = document.getElementById('editBack');
  if(back) back.style.display = 'none';
}
async function loadLead(leadId){
  try{
    const resp = await fetch('/sales/api/lead/' + leadId);
    const data = await resp.json();
    if(!data.ok) throw new Error(data.message || 'Failed');
    const l = data.lead;
    document.getElementById('editName').value = l.name || '';
    document.getElementById('editPhone').value = l.phone || '';
    document.getElementById('editTitleField').value = l.enquiry_title || '';
    document.getElementById('editDesc').value = l.enquiry_description || '';
  }catch(e){
    alert('Load lead failed: ' + e.message);
    closeEdit();
  }
}
async function saveLead(){
  const id = document.getElementById('editLeadId').value;
  const payload = {
    id,
    name: document.getElementById('editName').value.trim(),
    phone: document.getElementById('editPhone').value.trim(),
    enquiry_title: document.getElementById('editTitleField').value.trim(),
    enquiry_description: document.getElementById('editDesc').value.trim(),
  };
  if(payload.phone && !/^\d{10,15}$/.test(payload.phone)){
    alert('Phone must be 10–15 digits');
    return;
  }
  try{
    await api('/sales/api/lead/update', payload);
    toast('Saved');
    closeEdit();
    location.reload();
  }catch(e){
    alert('Save failed: ' + e.message);
  }
}
