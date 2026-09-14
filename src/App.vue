<script setup lang="ts">
// All the old game code now lives in src/views/Game.vue.
// App.vue's only job is to render whichever page the router picks:
// /login, /register, or / (the game, guarded by src/router/index.ts).
</script>

<template>
  <router-view />
</template>