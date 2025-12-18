const units = require('./units.json');
const { getTeams } = require('./lib/team-builder.js');

// units.push({
//         "name" : "Estelle",
//         "rank" : "S",
//         "tags" : ["defense", "ether", "pubsec"],
//         "join" : ["attack", "ether", "pubsec"],
//         "stat" : "M0W0"
//     })
units.push({
        "name" : "Ye Shunguong",
        "rank" : "S",
        "tags" : ["attack", "physical", "yunkui", "title"],
        "join" : ["support", "defense"],
        "stat" : "M2W1"
    })
units.push({
        "name" : "Zhao",
        "rank" : "S",
        "tags" : ["defense", "ice", "krampus"],
        "join" : ["attack", "anomaly", "rupture"],
        "stat" : "M0W0"
    })


const padding = Math.max(...units.map(unit => unit.name.length)) - 1; 

//now sort the list of teams by their team-name-as-string, so that we can iterate in order
const teams = getTeams(units);
var labels = [];
for(label in teams) {
    labels.push(label);
}
labels.sort();

//OK, teams are sorted and ready for final filtering 
const roster = new Map();
labels.forEach(label => {
    var team = teams[label];
    let valid = true;
      
    //Basic filtering options:
    valid = valid && (team.length == 3); //filter out pairs for now
    valid = valid && team.some(unit => unit.rank == "S"); //filter out teams with no S rank
    valid = valid && (team.some(unit => 
        (unit.tags.includes("attack") || unit.tags.includes("anomaly") || unit.tags.includes("rupture")))); //filter out teams that have no DPS unit

    //Filter out certain A-rank units, since they are not good enough to include: 
    valid = valid && !team.some(unit => [
        "Anby", 
        "Anton",
        "Ben", 
        "Billy",
        "Corin",
        "Seth"
    ].indexOf(unit.name) != -1); 
    
    //More customized filter options:

    //valid = valid && team.every(unit => unit.tags.includes("fire"));
    //valid = valid && team.every(unit => unit.tags.includes("ice"));
    //valid = valid && team.every(unit => unit.tags.includes("electric"));
    //valid = valid && team.every(unit => unit.tags.includes("physical"));
    //valid = valid && team.every(unit => unit.tags.includes("ether"));
    //valid = valid && team.some(unit => unit.name == "Ye Shunguong");
    //valid = valid && team.filter(unit => unit.tags.includes("stun")).length >= 1;
    valid = valid && team.every(unit => unit.rank == "S");
    valid = valid && team.some(unit => unit.tags.includes("title"));

    // valid = valid 
    //     && (team.every(unit => unit.tags.includes("fire"))
    //     ||  team.every(unit => unit.tags.includes("ice"))
    //     ||  team.every(unit => unit.tags.includes("electric"))
    //     ||  team.every(unit => unit.tags.includes("ether"))
    //     ||  team.every(unit => unit.tags.includes("physical")));

    valid = valid 
        && (team.filter(unit => unit.tags.includes("fire")    ).length >= 2
        ||  team.filter(unit => unit.tags.includes("ice")     ).length >= 2
        ||  team.filter(unit => unit.tags.includes("electric")).length >= 2
        ||  team.filter(unit => unit.tags.includes("ether")   ).length >= 2
        ||  team.filter(unit => unit.tags.includes("physical")).length >= 2);

    if(valid) {
        roster.set(label, team);
    }   
});

console.log("Total possible teams:         " + Object.keys(teams).length);
console.log("Filtered teams per criteria:  " + roster.size);
[...roster.keys()].forEach(label => console.log("  " + label));