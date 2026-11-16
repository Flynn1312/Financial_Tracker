import { createRouter, createWebHistory } from 'vue-router'

import LoginView from '../views/loginView.vue'
import PremiumView from '../views/premiumDashView.vue'
import BasicView from '../views/basicDashView.vue'

const router = createRouter({
  history: createWebHistory(),
  // Define the routes for the application
  routes: [
    {
      path: '/',
      component: LoginView
    },
    {
      path: '/basic',
      component: BasicView
    },
    {
      path: '/premium',
      component: PremiumView
    }
  ]
})

export default router