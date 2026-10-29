// The new-game switch for hirelings in a fight (option `hireSections`, rules 8.3.4c.2 to 8.4.8e; docs/design/rules-tdd/hirefight.md). It is one entry in newgame.js's option list (a group of its own), kept here so
// that the list stays easy to merge. Off, a hireling fights the older way: he goes for the most dangerous creature and two dice decide the blows. On, every round of a fight in which you have a live
// hireling is played on Melee Sections: you lure and deploy first (the Deployment step), then place your hirelings' counters in the Melee step.
export const SECTIONS_GROUP = { title: 'Hirelings in a fight', items: [
    { k: 'hireSections', title: 'Hirelings on Melee Sections', rule: '8.3.4c.2 to 8.4.8e', line: 'Your hirelings fight one to one, and you place their counters.',
      text: 'Each round of a fight in which you have a hireling starts with Deployment: each hireling may lure a creature onto a section of his own, or you send him at a target. In the Melee step you choose whom an attacked hireling strikes, where each counter stands in the three circles and squares, and which side a defending hireling shows. Off: a hireling goes for the most dangerous creature and two dice decide the blows. It does not change fights that other characters share.' },
] };
