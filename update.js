import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

// replace 1: Left panel
let leftSplit = content.split(") : viewMode === 'reports' ? (");
if (leftSplit.length > 1) {
    let leftStart = leftSplit[0];
    let leftRest = leftSplit[1];

    let leftEndIdx = leftRest.indexOf(') : (\n              <div className="flex-1 flex flex-col overflow-hidden relative z-10">\n                <div className="p-4 border-b border-gray-300 bg-[#f0f2f5]">\n                  <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-900">Trash Bin</h3>');
    if (leftEndIdx !== -1) {
        let leftEnd = leftRest.substring(leftEndIdx); // starts with ) : (
        content = leftStart + ') : (\n              <div className="flex-1 flex flex-col overflow-hidden relative z-10">\n                <div className="p-4 border-b border-gray-300 bg-[#f0f2f5]">\n                  <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-900">Trash Bin</h3>' + leftEnd.substring(') : (\n              <div className="flex-1 flex flex-col overflow-hidden relative z-10">\n                <div className="p-4 border-b border-gray-300 bg-[#f0f2f5]">\n                  <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-900">Trash Bin</h3>'.length);
    } else {
        console.log('leftEndIdx not found');
    }
}

// replace 2: Right panel
let rightSplit = content.split("{viewMode === 'reports' ? (");
if (rightSplit.length > 1) {
    let rightStart = rightSplit[0];
    let rightRest = rightSplit[1];

    let rightEndIdx = rightRest.indexOf(') : selectedNews ? (');
    if (rightEndIdx !== -1) {
        let rightEndContent = rightRest.substring(rightEndIdx);
        rightEndContent = rightEndContent.replace(') : selectedNews ? (', '{selectedNews ? (');
        content = rightStart + rightEndContent;
    } else {
        console.log('rightEndIdx not found');
    }
}

fs.writeFileSync('src/App.tsx', content, 'utf8');
console.log('App.tsx updated');
