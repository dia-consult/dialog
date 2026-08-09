document.addEventListener('DOMContentLoaded',()=>{
  const title=document.querySelector('.title');
  const player=document.querySelector('.player');
  if(title&&player&&!title.contains(player)) title.append(player);
});
