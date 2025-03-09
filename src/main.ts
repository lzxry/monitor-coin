import { createApp } from 'vue'
import { 
  Button,
  NavBar,
  Cell,
  CellGroup,
  Tag,
  Field,
  Switch,
  Radio,
  RadioGroup,
  Popup,
  showToast
} from 'vant'
import 'vant/lib/index.css'
import App from './App.vue'

const app = createApp(App)

// 注册Vant组件
app.use(Button)
app.use(NavBar)
app.use(Cell)
app.use(CellGroup)
app.use(Tag)
app.use(Field)
app.use(Switch)
app.use(Radio)
app.use(RadioGroup)
app.use(Popup)

app.mount('#app')
