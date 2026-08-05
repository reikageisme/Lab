import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // below normal load
    { duration: '1m', target: 10 },
    { duration: '10s', target: 2000 }, // spike to 2000 users
    { duration: '3m', target: 2000 }, // stay at 2000 for 3 mins
    { duration: '10s', target: 10 }, // scale down. Recovery stage.
    { duration: '1m', target: 10 },
    { duration: '10s', target: 0 },
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
