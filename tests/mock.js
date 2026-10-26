// in-memory Google Sheets mock
class Range{constructor(sh,r,c,nr,nc){Object.assign(this,{sh,r,c,nr:nr||1,nc:nc||1})}
 getValues(){const o=[];for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++){const v=(this.sh.d[this.r-1+i]||[])[this.c-1+j];row.push(v===undefined?'':v)}o.push(row)}return o}
 getDisplayValues(){return this.getValues().map(r=>r.map(v=>String(v)))}
 getValue(){return this.getValues()[0][0]}
 setValues(v){v.forEach((row,i)=>row.forEach((x,j)=>{const R=this.r-1+i;while(this.sh.d.length<=R)this.sh.d.push([]);this.sh.d[R][this.c-1+j]=x}));this.sh.writes++;return this}
 setValue(x){return this.setValues([[x]])}
 setFontWeight(){return this}setBackground(){return this}setFontColor(){return this}setNumberFormat(){return this}setHorizontalAlignment(){return this}}
class Sheet{constructor(name,d){this.name=name;this.d=d||[];this.writes=0;this.id=Math.floor(Math.random()*1e9)}
 getName(){return this.name}getSheetId(){return this.id}
 getLastRow(){let n=this.d.length;while(n>0&&!(this.d[n-1]||[]).some(v=>v!==''&&v!==undefined))n--;return n}
 getLastColumn(){return Math.max(0,...this.d.map(r=>{let n=r.length;while(n>0&&(r[n-1]===''||r[n-1]===undefined))n--;return n}))}
 getMaxColumns(){return 500}getMaxRows(){return 1000}insertColumnsAfter(){}
 getRange(a,b,c,d){if(typeof a==='string')return new Range(this,1,1,1,1);return new Range(this,a,b,c,d)}
 appendRow(r){this.d.splice(this.getLastRow(),0,r.slice())}
 clearContents(){this.d=[]}
 setFrozenRows(){}setRightToLeft(){}setColumnWidth(){}}
class Book{constructor(){this.sheets=[]}getSheetByName(n){return this.sheets.find(s=>s.name===n)||null}
 insertSheet(n){const s=new Sheet(n);this.sheets.push(s);return s}getSheets(){return this.sheets}getId(){return 'BOOK'}}
module.exports={Sheet,Book,Range};
