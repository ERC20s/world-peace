// Minimal JS: client-side filter for conflicts list and mobile helpers
document.addEventListener('DOMContentLoaded',function(){
  var input = document.getElementById('conflict-search');
  var list = document.getElementById('conflict-list');
  if(input && list){
    input.addEventListener('input',function(){
      var q = input.value.trim().toLowerCase();
      Array.prototype.forEach.call(list.querySelectorAll('li'),function(li){
        var text = li.textContent.toLowerCase();
        li.style.display = q === '' || text.indexOf(q) !== -1 ? '' : 'none';
      });
    });
  }
});
