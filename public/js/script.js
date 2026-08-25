/* CONFIG BOT */

const BOT_ID = "1540939068693544992";
const STATUS_URL = "";

const INVITE_URL =
`https://discord.com/oauth2/authorize?client_id=${BOT_ID}&permissions=268446736&scope=bot%20applications.commands`;


/* BOT INVITE */

document.querySelectorAll(".hero-btn").forEach(btn=>{
btn.addEventListener("click",()=>{
window.open(INVITE_URL,"_blank","noopener,noreferrer")
})
})


/* TYPEWRITER */

const typewriter = document.querySelector(".typewriter");

const text =
"Mejora tu servidor con TGXBot, un bot con moderación inteligente, niveles y roles automáticos.";

let i = 0;

function typing(){

if(typewriter && i < text.length){

typewriter.textContent += text.charAt(i);
i++;

setTimeout(typing,40);

}

}

typing();


/* STATS ANIMATION */

function animateValue(id,start,end,duration){

const obj = document.getElementById(id);

if(!obj) return;

let startTime = null;

function step(timestamp){

if(!startTime) startTime = timestamp;

const progress = Math.min((timestamp-startTime)/duration,1);

obj.textContent = Math.floor(progress*(end-start)+start).toLocaleString();

if(progress < 1) requestAnimationFrame(step);

}

requestAnimationFrame(step);

}


const statsSection = document.querySelector(".stats");

const observer = new IntersectionObserver(entries=>{

if(entries[0].isIntersecting){

animateValue("servers",0,1250,2000);
animateValue("users",0,45800,2000);
animateValue("commands",0,890432,2000);

observer.disconnect();

}

},{threshold:0.5})

if(statsSection) observer.observe(statsSection);



/* FAQ */

document.querySelectorAll(".faq-item").forEach(item=>{

const question = item.querySelector(".faq-question");

if(!question) return;

question.addEventListener("click",()=>{

item.classList.toggle("active")
question.setAttribute("aria-expanded", item.classList.contains("active"));

})

})


/* NAVBAR SCROLL */

const header = document.getElementById("header");

window.addEventListener("scroll",()=>{

if(!header) return;

if(window.scrollY > 50){

header.classList.add("scrolled")

}else{

header.classList.remove("scrolled")

}

})


/* SCROLL REVEAL */

const sr = typeof ScrollReveal === "function" ? ScrollReveal({

distance:"50px",
duration:1000,
origin:"bottom",
interval:200

}) : null;

if(sr){
sr.reveal(".hero");
sr.reveal(".card");
sr.reveal(".stat");
sr.reveal(".preview-box");
sr.reveal(".command-card");
}


/* BACK TO TOP */

const backToTop = document.getElementById("backToTop");

window.addEventListener("scroll",()=>{

if(backToTop && window.scrollY > 500){

backToTop.style.display="block"

}else if(backToTop){

backToTop.style.display="none"

}

})

if(backToTop) backToTop.onclick = ()=>{

window.scrollTo({top:0,behavior:"smooth"})

}


if(typeof particlesJS === "function") particlesJS("particles-js", {
  particles: {
    number: { value: 80 },
    color: { value: "#3b82f6" },
    shape: { type: "circle" },
    opacity: { value: 0.5 },
    size: { value: 3 },
    line_linked: {
      enable: true,
      distance: 150,
      color: "#3b82f6",
      opacity: 0.4
    },
    move: {
      enable: true,
      speed: 2
    }
  }
});


async function checkBotStatus(){

const statusText = document.querySelector(".status-text");
const statusDot = document.querySelector(".status-dot");

if(!statusText || !statusDot) return;

if(!STATUS_URL){
statusText.textContent = "Estado no disponible";
statusDot.style.background = "#94a3b8";
return;
}

try{

const res = await fetch(STATUS_URL, { mode: "cors" });

if(!res.ok) throw new Error(`Status endpoint returned ${res.status}`);

const data = await res.json();

if(data.status === "online"){

statusText.textContent = "Sistema Online";
statusDot.style.background = "#22c55e";

}

if(data.status === "offline"){

statusText.textContent = "Sistema Offline";
statusDot.style.background = "#ef4444";

}

}catch{

statusText.textContent = "Sistema Offline";
statusDot.style.background = "#ef4444";

}

}

// revisar cada 5 segundos
if(STATUS_URL) setInterval(checkBotStatus,5000);

checkBotStatus();