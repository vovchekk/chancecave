// Check if we're on the caves.wolf.game page
chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
  var tab = tabs[0];
  var status = document.getElementById('status');
  
  if (tab && tab.url && tab.url.includes('caves.wolf.game')) {
    status.textContent = '✓ Mapper active on this page!';
    status.className = 'status';
  } else {
    status.textContent = 'Navigate to caves.wolf.game to activate';
    status.className = 'status inactive';
  }
});
