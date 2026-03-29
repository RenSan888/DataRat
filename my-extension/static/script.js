const loader = document.getElementById("loader");
const startBtn = document.getElementById("startBtn");


setTimeout(() => {
    loader.style.display = "none";     
    startBtn.classList.add("show");    
}, 3000); 
