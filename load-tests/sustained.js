import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 200 }, // ramp up to 200 users
    { duration: '10m', target: 200 }, // stay at 200 for 10 minutes
    { duration: '30s', target: 0 }, // scale down
  ],
};

const BASE_URL = 'http://target-app:3000';

export default function () {
  const routes = ['/login', '/search', '/checkout'];
  const route = routes[Math.floor(Math.random() * routes.length)];
  
  let res;
  if (route === '/search') {
    res = http.get(`${BASE_URL}${route}?q=test`);
  } else {
    res = http.post(`${BASE_URL}${route}`, JSON.stringify({ username: 'test', password: 'password' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  
  sleep(1);
}
