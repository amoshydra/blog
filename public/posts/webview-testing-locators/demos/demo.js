// When the page is embedded with ?only=<section-id>, keep just that section.
// The iframe can then size itself to a fixed document height, so nothing
// inside it ever scrolls and nothing outside it gets dragged around.
const only = new URLSearchParams(location.search).get("only");
if (only) {
  document.querySelectorAll("body > section").forEach((section) => {
    if (section.id !== only) section.remove();
  });
}

// ?click=<id> clicks one control once the demo's own listeners are attached,
// so a dump can capture the interacted state (an open modal, a toast).
const click = new URLSearchParams(location.search).get("click");
if (click) {
  const target = document.getElementById(click);
  if (target) target.click();
}
