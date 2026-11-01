import {useEffect,useState} from 'react'
import {applyTheme,type Theme} from '../lib/theme'
/** Shared preference with the blog. / 与博客共用主题偏好。 */
export function ThemeToggle(){
 const [theme,setTheme]=useState<Theme>(document.documentElement.dataset.theme==='light'?'light':'dark')
 useEffect(()=>{const sync=()=>setTheme(document.documentElement.dataset.theme==='light'?'light':'dark');window.addEventListener('telrest-theme-change',sync);return()=>window.removeEventListener('telrest-theme-change',sync)},[])
 const label=theme==='dark'?'切换为浅色模式':'切换为深色模式'
 return <button type="button" className="btn theme-switch" aria-label={label} title={label} aria-pressed={theme==='light'} onClick={()=>applyTheme(theme==='dark'?'light':'dark',true)}>
 <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">{theme==='dark'?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/></>:<path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>}</svg>
 </button>
}
