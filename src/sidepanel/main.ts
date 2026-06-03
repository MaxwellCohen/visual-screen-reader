import { mount } from 'svelte'
import './sidepanel.css'
import App from './App.svelte'

mount(App, {
  target: document.getElementById('app')!,
})
