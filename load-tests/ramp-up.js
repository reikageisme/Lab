import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 }, // simulate ramp-up of traffic from 1 to 100 users over 30 seconds
    { duration: '1m', target: 1000 }, // ramp-up to 1000 users over 1 minute
    { duration: '30s', target: 0 }, // ramp-down to 0 users
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
