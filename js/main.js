// Minimal JS: client-side filter for the site's link lists (conflicts, organisations)
document.addEventListener('DOMContentLoaded',function(){
  function wire(inputId,listId){
    var input = document.getElementById(inputId);
    var list = document.getElementById(listId);
    if(input && list){
      input.addEventListener('input',function(){
        var q = input.value.trim().toLowerCase();
        Array.prototype.forEach.call(list.querySelectorAll('li'),function(li){
          var text = li.textContent.toLowerCase();
          li.style.display = q === '' || text.indexOf(q) !== -1 ? '' : 'none';
        });
      });
    }
  }

  wire('conflict-search','conflict-list');
  wire('organisation-search','organisation-list');
});
