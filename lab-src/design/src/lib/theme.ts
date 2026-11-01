export type Theme='dark'|'light'
const key='telrest-theme-v2'
export function applyTheme(theme:Theme,persist=false){
 document.documentElement.dataset.theme=theme
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#11271f':'#f0f4eb')
 if(persist)try{localStorage.setItem(key,theme)}catch{}
 window.dispatchEvent(new Event('telrest-theme-change'))
}
export function initializeTheme(){
 let theme:Theme='dark';try{if(localStorage.getItem(key)==='light')theme='light'}catch{}
 applyTheme(theme)
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)applyTheme(event.newValue==='light'?'light':'dark')})
}
