import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    { path: '/map-explorer', component: () => import('../views/MapExplorerStepsView.vue') },
    { path: '/map-explorer-webgl-temp', component: () => import('../views/MapExplorerStepsViewWebglTemp.vue') },
    { path: '/map-explorer-webgl-temp-2', component: () => import('../views/MapExplorerStepsViewWebglTemp2.vue') },
    { path: '/map-explorer/:seed', component: () => import('../views/MapExplorerStepsView.vue') },
    { path: '/map-explorer-webgl-leaflet', component: () => import('../views/MapExplorerStepsViewWebGlLeaflet.vue') },
    { path: '/map-explorer-webgl-leaflet-overlay', component: () => import('../views/MapExplorerStepsViewWebGlLeafletOverlay.vue') },
    { path: '/map-explorer-webgl-leaflet-overlay/:seed', component: () => import('../views/MapExplorerStepsViewWebGlLeafletOverlay.vue') },
    // { path: '/map-explorer', component: () => import('../views/MapExplorerView.vue') },
    //{ path: '/trait-finder', component: () => import('../views/WorldTraitFinderView.vue') },
    { path: '/trait-finder', component: () => import('../views/WorldTraitFinderSgtView.vue') },
    { path: '/starmap-generator', component: () => import('../views/StarmapGeneratorView.vue') },
    { path: '/seed-viewer', component: () => import('../views/SeedViewerView.vue') },

    { path: '/about', component: () => import('../views/AboutView.vue') },
    { path: '/contribute', component: () => import('../views/ContributeView.vue') },

    { path: '/:pathMatch(.*)*', component: () => import('../views/Errors/404.vue') }, // todo: check if they have passed a seed, if not, redirect to map-explorer/seed
  ]
})

export default router
