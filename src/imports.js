// ============================================================
// DOLLOPS ADMIN — IMPORT FEATURES
// ============================================================

function handleExcelImport(file) {
  if (!file) return;
  document.getElementById('excelFileInput').value = '';
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(new Uint8Array(e.target.result), {
        type: 'array', cellFormula: false, cellNF: false, cellText: false, raw: false
      });
      var allParsed = [];
      wb.SheetNames.forEach(function(name) {
        var ym = name.match(/20(\d{2})/);
        if (!ym) return;
        var year   = parseInt('20' + ym[1]);
        var parsed = parseSheet(wb.Sheets[name], year);
        if (parsed.income.length || parsed.expenses.length) {
          allParsed.push({ year: year, sheetName: name, data: parsed });
        }
      });
      if (!allParsed.length) { showToast('No P&L data found in this file.'); return; }
      showExcelPreview(allParsed);
    } catch(err) { console.error(err); showToast('Could not read file: ' + err.message); }
  };
  reader.readAsArrayBuffer(file);
}

function parseSheet(sheet, year) {
  var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });

  var MONTH_NAMES   = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  var MONTH_ALIASES = { 'febuary': 1 };
  var INCOME_SEC    = ['incomings', 'income'];
  var EXPENSE_SEC   = ['outgoings', 'expenses'];
  var STOP_ROWS     = ['total incomings','total income','total outgoings','total expenses','net profit','amount in bank'];

  var monthCols  = null;
  var labelCol   = -1;
  var inIncome   = false;
  var inExpenses = false;
  var income     = [];
  var expenses   = [];

  rows.forEach(function(row) {
    if (!row) return;

    // --- Detect the month header row (only once) ---
    if (monthCols === null) {
      var found = {};
      row.forEach(function(cell, ci) {
        if (typeof cell !== 'string') return;
        var lo  = cell.toLowerCase().trim();
        var idx = MONTH_NAMES.indexOf(lo);
        if (idx === -1 && MONTH_ALIASES[lo] !== undefined) idx = MONTH_ALIASES[lo];
        if (idx !== -1) found[ci] = idx;
      });

      if (Object.keys(found).length >= 6) {
        monthCols = found;
        var firstMC = Math.min.apply(null, Object.keys(found).map(Number));
        labelCol    = firstMC - 1;

        // *** KEY FIX: "INCOMINGS" / "OUTGOINGS" can be on the SAME row as the months ***
        // Check col B (labelCol) of THIS header row for a section keyword
        var sameRowLabel = (labelCol >= 0 && row[labelCol]) ? String(row[labelCol]).toLowerCase().trim() : '';
        if (INCOME_SEC.indexOf(sameRowLabel) !== -1)  { inIncome = true;  inExpenses = false; }
        if (EXPENSE_SEC.indexOf(sameRowLabel) !== -1) { inExpenses = true; inIncome = false;  }
        return; // skip this header row for data parsing
      }
    }

    if (monthCols === null || labelCol === -1) return;

    var rawLabel = row[labelCol] !== undefined ? row[labelCol] : null;
    var label    = rawLabel !== null && rawLabel !== undefined ? String(rawLabel).trim() : '';
    var lower    = label.toLowerCase();

    // Skip rows that look like a second month-header row
    var monthCount = 0;
    row.forEach(function(cell) {
      if (typeof cell !== 'string') return;
      var lo = cell.toLowerCase().trim();
      if (MONTH_NAMES.indexOf(lo) !== -1 || MONTH_ALIASES[lo] !== undefined) monthCount++;
    });
    if (monthCount >= 6) {
      // It's another header row — check if it has a section keyword too
      if (INCOME_SEC.indexOf(lower) !== -1)  { inIncome = true;  inExpenses = false; }
      if (EXPENSE_SEC.indexOf(lower) !== -1) { inExpenses = true; inIncome = false;  }
      return;
    }

    // Section keywords on their own row
    if (INCOME_SEC.indexOf(lower) !== -1)  { inIncome = true;  inExpenses = false; return; }
    if (EXPENSE_SEC.indexOf(lower) !== -1) { inExpenses = true; inIncome = false;  return; }

    // Stop rows
    if (STOP_ROWS.some(function(s){ return lower.indexOf(s) !== -1; })) return;
    if (!label) return;
    if (!inIncome && !inExpenses) return;

    // Read monthly values
    Object.keys(monthCols).forEach(function(ci) {
      ci = parseInt(ci);
      var val = (ci < row.length) ? row[ci] : null;
      if (val === null || val === undefined || val === '') return;
      var amount = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
      if (isNaN(amount) || amount === 0) return;

      var monthIdx = monthCols[ci];
      var date     = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-01';
      var rounded  = Math.round(amount * 100) / 100;

      if (inIncome)   income.push({ date: date, desc: toTitleCase(label), amount: rounded });
      if (inExpenses) expenses.push({ date: date, category: toTitleCase(label), amount: rounded });
    });
  });

  return { income: income, expenses: expenses };
}

// ---- PREVIEW ----
function showExcelPreview(allParsed) {
  var total = allParsed.reduce(function(s,p){ return s+p.data.income.length+p.data.expenses.length; }, 0);
  var html  = '<h2>📊 Excel Import Preview</h2>';
  html += '<p style="color:#666;margin-bottom:20px">Found <strong>' + total + '</strong> entries across <strong>' + allParsed.length + '</strong> year(s). Existing data for each year will be replaced.</p>';

  allParsed.forEach(function(p) {
    var ti = p.data.income.reduce(function(s,i){ return s+i.amount; },0);
    var te = p.data.expenses.reduce(function(s,e){ return s+e.amount; },0);
    html += '<div style="margin-bottom:20px;border:2px solid var(--border);border-radius:14px;overflow:hidden">';
    html += '<div style="background:var(--dark);color:white;padding:11px 16px;display:flex;justify-content:space-between">';
    html += '<span style="font-family:Fredoka One,cursive;font-size:18px">📅 ' + p.year + ' — ' + p.sheetName + '</span>';
    html += '<span style="font-size:12px;opacity:.8">' + p.data.income.length + ' income · ' + p.data.expenses.length + ' outgoing entries</span>';
    html += '</div><div style="display:grid;grid-template-columns:1fr 1fr">';

    function buildCol(rows, isIncome) {
      var tot = isIncome ? ti : te;
      var col = isIncome ? 'var(--green)' : 'var(--red)';
      var lbl = isIncome ? 'Total Income' : 'Total Outgoings';
      var key = isIncome ? 'desc' : 'category';
      var out = '<div style="padding:14px' + (isIncome ? ';border-right:1px solid var(--border)' : '') + '">';
      out += '<div style="font-family:Fredoka One,cursive;font-size:20px;color:' + col + ';margin-bottom:6px">' + fmtCurrency(tot) + '</div>';
      out += '<div style="font-size:11px;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">' + lbl + '</div>';
      if (rows.length) {
        out += '<table style="width:100%;font-size:12px;border-collapse:collapse">';
        rows.slice(0,15).forEach(function(r){
          out += '<tr style="border-bottom:1px solid #f5f5f5"><td style="padding:4px 6px">' + fmtDate(r.date) + '</td><td style="padding:4px 6px">' + r[key] + '</td><td style="padding:4px 6px;text-align:right;white-space:nowrap">' + fmtCurrency(r.amount) + '</td></tr>';
        });
        if (rows.length > 15) out += '<tr><td colspan="3" style="padding:4px 6px;color:#aaa;font-style:italic">+ ' + (rows.length-15) + ' more</td></tr>';
        out += '</table>';
      } else {
        out += '<p style="color:#aaa;font-size:12px">None found</p>';
      }
      return out + '</div>';
    }

    html += buildCol(p.data.income, true) + buildCol(p.data.expenses, false);
    html += '</div></div>';
  });

  window._pendingExcel = allParsed;
  html += '<div style="display:flex;gap:12px;margin-top:16px;padding-top:16px;border-top:2px solid var(--border)">';
  html += '<button class="btn btn-primary" onclick="confirmExcelImport()">✅ Confirm Import</button>';
  html += '<button class="btn btn-ghost" onclick="hideModal(\'importModalOverlay\')">Cancel</button>';
  html += '</div>';
  document.getElementById('importModalContent').innerHTML = html;
  showModal('importModalOverlay');
}

function confirmExcelImport() {
  var ap = window._pendingExcel;
  if (!ap) return;
  ap.forEach(function(p){ savePLData(p.year, { income: p.data.income, expenses: p.data.expenses }); });
  hideModal('importModalOverlay');
  showToast('✅ Imported data for ' + ap.map(function(p){ return p.year; }).join(', ') + '!');
  if (document.getElementById('section-pl').classList.contains('active')) loadPL();
  window._pendingExcel = null;
}

// ============================================================
// TSB BANK STATEMENT PDF IMPORT
// ============================================================
function handlePDFImport(file) {
  if (!file) return;
  document.getElementById('pdfFileInput').value = '';
  var reader = new FileReader();
  reader.onload = function(e) {
    pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise
      .then(function(pdf) {
        var nums = []; for (var i=1;i<=pdf.numPages;i++) nums.push(i);
        return Promise.all(nums.map(function(n) {
          return pdf.getPage(n).then(function(pg) {
            return pg.getTextContent().then(function(tc) {
              var items = tc.items.slice().sort(function(a,b){
                var dy = Math.round(b.transform[5]) - Math.round(a.transform[5]);
                return dy !== 0 ? dy : a.transform[4] - b.transform[4];
              });
              return items.map(function(i){ return i.str; }).join(' ');
            });
          });
        }));
      })
      .then(function(pages) { parseTSBStatement(pages.join('\n'), file.name); })
      .catch(function(err) { console.error(err); showToast('Could not read PDF: ' + err.message); });
  };
  reader.readAsArrayBuffer(file);
}

function parseTSBStatement(text, filename) {
  var statYear = new Date().getFullYear(), statMonth = new Date().getMonth();
  var pm = text.match(/Effective from[:\s]+\d+\s+\w+\s+\d{4}\s+to\s+(\d+)\s+(\w+)\s+(\d{4})/i);
  if (pm) { var ed = new Date(pm[2]+' '+pm[1]+' '+pm[3]); if(!isNaN(ed)){statYear=ed.getFullYear();statMonth=ed.getMonth();} }

  var MA = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  var segs = [], last = 0;
  var dp = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\b/gi, m;
  while ((m = dp.exec(text)) !== null) {
    if (segs.length) segs[segs.length-1].text = text.substring(last, m.index);
    segs.push({ date: (2000+parseInt(m[3]))+'-'+String(MA[m[2].toLowerCase()]+1).padStart(2,'0')+'-'+String(parseInt(m[1])).padStart(2,'0'), raw: m[0], text: '' });
    last = m.index + m[0].length;
  }
  if (segs.length) segs[segs.length-1].text = text.substring(last);

  // ---- Extract opening balance to seed direction detection ----
  var prevBalance = null;
  var openMatch = text.match(/Balance on[^\[\£]*(\[|£)(\d[\d,]*\.\d{2})/i);
  if (!openMatch) openMatch = text.match(/OPENING BALANCE[^\d]*(\d[\d,]*\.\d{2})/i);
  if (openMatch) prevBalance = parseFloat(openMatch[openMatch.length-1].replace(',',''));

  var txs = [];
  segs.forEach(function(seg) {
    var txt = (seg.raw + ' ' + seg.text).trim();

    // Skip opening/closing balance rows
    if (/OPENING BALANCE|CLOSING BALANCE/i.test(txt)) return;

    // Extract all decimal numbers
    var nums=[], nr=/\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g, nm;
    while((nm=nr.exec(txt))!==null) nums.push(parseFloat(nm[1].replace(',','')));

    // Need exactly 2 numbers: [tx_amount, new_balance]
    // 1 number = balance only (skip), 3+ = closing balance row (skip)
    if (nums.length < 2) return;
    if (nums.length >= 3) return;

    var amt     = nums[0];  // transaction amount
    var newBal  = nums[1];  // running balance after transaction
    if (amt < 0.01) return;

    // *** DIRECTION: use balance change — 100% accurate, no keyword guessing ***
    // If balance went UP → money came IN. If balance went DOWN → money went OUT.
    var isIncome;
    if (prevBalance !== null) {
      var change = Math.round((newBal - prevBalance) * 100) / 100;
      isIncome = change > 0;
    } else {
      // Fallback to keywords only if we have no previous balance
      isIncome = /CREDIT INTEREST|INTEREST|REFUND|CASHBACK/.test(txt.toUpperCase());
    }
    prevBalance = newBal;

    // Build clean description
    var desc = txt
      .replace(/\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2}/gi,'')
      .replace(/\b(?:FASTER PAYMENT|DIRECT DEBIT|STANDING ORDER|CREDIT INTEREST|DEBIT CARD|ATM|BACS|CD \d+)\b/gi,'')
      .replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g,'')
      .replace(/\s{2,}/g,' ').trim();
    if (!desc) return;

    txs.push({ date: seg.date, details: desc, moneyIn: isIncome?amt:0, moneyOut: isIncome?0:amt, category: categorizeTSB(desc,isIncome) });
  });

  if (!txs.length) { showToast('No transactions found — check this is a TSB statement PDF.'); return; }
  showBankPreview(txs, statYear, filename);
}

// classifyTSB no longer used for direction — kept only for category hints
function classifyTSB(d) {
  var u=d.toUpperCase();
  if (/CREDIT INTEREST|INTEREST/.test(u)) return true;
  if (/TESCO|ASDA|SAINSBURY|MORRISONS|LIDL|ALDI|AMAZON|PAYPAL|GOOGLE|APPLE|NATIONWIDE SAVINGS/.test(u)) return false;
  return false;
}

function categorizeTSB(d, isInc) {
  var u=d.toUpperCase();
  if (!isInc) {
    if (/TESCO|ASDA|SAINSBURY|MORRISONS|LIDL|ALDI/.test(u)) return 'Order Costs';
    if (/AMAZON|SCREWFIX|ARGOS/.test(u))                    return 'Equipment Costs';
    if (/GOOGLE|WORDPRESS|DOMAIN|HOSTING/.test(u))          return 'Website & Email';
    return 'Other';
  }
  if (/CREDIT INTEREST|INTEREST/.test(u)) return 'Bank Interest';
  if (/DOLLOPS/.test(u))                  return 'Order Income';
  return 'Other Income';
}

function showBankPreview(txs, year, filename) {
  var ti=txs.filter(function(t){return t.moneyIn>0;}).reduce(function(s,t){return s+t.moneyIn;},0);
  var to=txs.filter(function(t){return t.moneyOut>0;}).reduce(function(s,t){return s+t.moneyOut;},0);
  var iC=['Order Income','Bank Interest','Other Income'];
  var eC=['Order Costs','Website & Email','Equipment Costs','Tub Labels','Product Research','Packaging','Marketing','Other'];

  var html='<h2>🏦 Bank Statement Import</h2>';
  html+='<p style="color:#666;margin-bottom:4px">File: <strong>'+filename+'</strong></p>';
  html+='<p style="color:#666;margin-bottom:14px"><strong>'+txs.length+'</strong> transactions found. Adjust categories or uncheck rows you don\'t want.</p>';
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';
  html+='<div style="background:#e8f5e9;border-radius:10px;padding:12px;text-align:center"><div style="font-family:Fredoka One,cursive;font-size:24px;color:#2e7d32">'+fmtCurrency(ti)+'</div><div style="font-size:11px;font-weight:800;color:#888;text-transform:uppercase">Money In</div></div>';
  html+='<div style="background:#ffebee;border-radius:10px;padding:12px;text-align:center"><div style="font-family:Fredoka One,cursive;font-size:24px;color:#c62828">'+fmtCurrency(to)+'</div><div style="font-size:11px;font-weight:800;color:#888;text-transform:uppercase">Money Out</div></div>';
  html+='</div>';
  html+='<div style="max-height:300px;overflow-y:auto;border:2px solid var(--border);border-radius:12px;margin-bottom:14px">';
  html+='<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html+='<thead><tr style="background:var(--dark);color:white"><th style="padding:8px 10px;text-align:left">Date</th><th style="padding:8px 10px;text-align:left">Description</th><th style="padding:8px 10px;text-align:left">Category</th><th style="padding:8px 10px;text-align:right">Amount</th><th style="padding:8px 10px;text-align:center">✓</th></tr></thead><tbody>';

  txs.forEach(function(t,i) {
    var isI=t.moneyIn>0, amt=isI?t.moneyIn:t.moneyOut;
    var cats=(isI?iC:eC).map(function(c){ return '<option value="'+c+'"'+(c===t.category?' selected':'')+'>'+c+'</option>'; }).join('');
    html+='<tr style="background:'+(isI?'#f6fff6':'#fff6f6')+';border-bottom:1px solid #f0f0f0">';
    html+='<td style="padding:6px 10px;white-space:nowrap">'+fmtDate(t.date)+'</td>';
    html+='<td style="padding:6px 10px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+t.details+'">'+(isI?'📈 ':'📉 ')+t.details+'</td>';
    html+='<td style="padding:6px 10px"><select id="txCat_'+i+'" style="padding:3px 5px;border:1px solid #ddd;border-radius:5px;font-size:11px">'+cats+'</select></td>';
    html+='<td style="padding:6px 10px;text-align:right;font-weight:700">'+fmtCurrency(amt)+'</td>';
    html+='<td style="padding:6px 10px;text-align:center"><input type="checkbox" id="txInclude_'+i+'" checked style="width:14px;height:14px;accent-color:var(--pink)"></td>';
    html+='</tr>';
  });

  html+='</tbody></table></div>';
  window._pendingBankTx={transactions:txs,year:year};
  html+='<div style="display:flex;gap:12px"><button class="btn btn-primary" onclick="confirmBankImport()">✅ Import Selected</button><button class="btn btn-ghost" onclick="hideModal(\'importModalOverlay\')">Cancel</button></div>';
  document.getElementById('importModalContent').innerHTML=html;
  showModal('importModalOverlay');
}

function confirmBankImport() {
  if (!window._pendingBankTx) return;
  var txs=window._pendingBankTx.transactions, year=window._pendingBankTx.year;
  var data=getPLData(year), ci=0, ce=0;
  txs.forEach(function(t,i){
    var inc=document.getElementById('txInclude_'+i), cat=document.getElementById('txCat_'+i);
    if (!inc||!inc.checked) return;
    var isI=t.moneyIn>0, amt=isI?t.moneyIn:t.moneyOut;
    if (isI) { data.income.push({date:t.date,desc:cat?cat.value:t.category,amount:amt}); ci++; }
    else     { data.expenses.push({date:t.date,category:cat?cat.value:t.category,amount:amt}); ce++; }
  });
  savePLData(year,data);
  hideModal('importModalOverlay');
  showToast('✅ Imported '+ci+' income + '+ce+' expense entries!');
  if (document.getElementById('section-pl').classList.contains('active')) loadPL();
  window._pendingBankTx=null;
}

function toTitleCase(s) {
  if (!s) return '';
  return s.replace(/\w\S*/g, function(w){ return w.charAt(0).toUpperCase()+w.substr(1).toLowerCase(); });
}