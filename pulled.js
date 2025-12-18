const units = require('./units.json');

function toLabel(c, w) {
    return "M" + Math.max(0,Math.min(c,6)) + "W" + Math.max(0,Math.min(w,5));
}

const map = new Map();
for(let c = 6; c >= 0; c--) {
    for(let w = 5; w >= 0; w--)  {
        map.set(toLabel(c,w), []);
    }
}
for(unit of units) {
    map.get(unit.stat).push(unit.name);
}
console.log(" ");
[...map.keys()].forEach(status => {
    const list = map.get(status);
    if(list.length > 0) console.log(`${status} : ${list.join(", ")}`);
});
