// Probe for v1.4.5 index-system classes: search hits per system family + the 索引族 group chips.
// usage: PROBE_SRC=<page.html> PROBE_OUT=<probe.html> node make_classprobe.cjs
const fs = require('fs');
const SRC = process.env.PROBE_SRC || 'D:/DsHs/grau/grau_index.v1.4.2.1/grau_index.linked.html';
const OUT = process.env.PROBE_OUT || 'D:/DsHs/grau/_raw/_probe_class.html';
const TESTS = (process.env.PROBE_TESTS ||
  '48Н6,55Ж6,58Ж6-01,ФАБ-50,А3-ЗС-42,А4-ЖБ,76В157,10П50,1ОП50,ШОЗТ,3-О-12,7-З-1,9-А-016,5-ОП-517').split(',');
const h = fs.readFileSync(SRC, 'utf8');
const code = [
  'window.__e=[];window.addEventListener("error",function(e){window.__e.push(String(e.message))});',
  'function setQ(v){var el=document.getElementById("q");el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',
  'function state(){var rows=document.querySelectorAll("#content li.e");var ids=[];',
  '  for(var i=0;i<Math.min(3,rows.length);i++){ids.push(String(rows[i].querySelector(".id").textContent).trim());}',
  '  return document.getElementById("hits").textContent.trim().replace(/\\s+/g," ")+" n="+rows.length+" ids="+ids.join(",");}',
  'function grpChip(name){var bs=document.querySelectorAll(".fset button.fk.grp");',
  '  for(var i=0;i<bs.length;i++){if(bs[i].textContent.indexOf(name)>=0)return bs[i];}return null;}',
  'setTimeout(function(){var out=[];',
  '  var tests=' + JSON.stringify(TESTS) + ';',
  '  for(var i=0;i<tests.length;i++){setQ(tests[i]);out.push(tests[i]+" -> "+state());}',
  '  setQ("");',
  '  var groups=document.querySelectorAll(".fset button.fk.grp");var names=[];',
  '  for(var g=0;g<groups.length;g++){names.push(groups[g].textContent.replace(/\\s+/g," ").trim());}',
  '  out.push("группы("+groups.length+"): "+names.join(" | "));',
  '  var gts=document.querySelectorAll(".grptag");var gt=[];',
  '  for(var q=0;q<gts.length;q++){gt.push(gts[q].textContent.replace(/\\s+/g," ").trim());}',
  '  out.push("体系组("+gts.length+"): "+gt.join(" | "));',
  '  var c=grpChip("ПВО 反序6");',
  '  if(c){c.click();out.push("click ПВО 反序6 -> "+state()+" chips="+document.querySelectorAll(".fset button.fk.sub").length);}',
  '  else out.push("ПВО 反序6 chip not found");',
  '  out.push("errors="+window.__e.length+":"+window.__e.join(";"));',
  '  var d=document.createElement("pre");d.id="__l";d.textContent=out.join("\\n");document.body.appendChild(d);},1800);',
].join('\n');
fs.writeFileSync(OUT, h.replace('</head>', '<script>try{localStorage.clear();}catch(e){}</script>\n</head>').replace('</body>', '<script>\n' + code + '\n</script>\n</body>'), 'utf8');
console.log('class probe written: ' + OUT);
