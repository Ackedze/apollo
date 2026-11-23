import { createCooperativeYield } from './promisePool';
// Same UTF-8 and SHA-256 rounds as the existing code utility; bounded host
// turns and a single block keep large audit assets cancellable without copies.
const SHA256_INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const SHA256_ROUNDS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rightRotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));


export async function sha256Hex(input:string,guard:()=>void=()=>{}):Promise<string>{
 const checkpoint=createCooperativeYield(guard),block=new Uint8Array(64),view=new DataView(block.buffer),words=new Int32Array(64),hash=new Int32Array(SHA256_INITIAL);
 let used=0,length=0,characters=0;
 function compress(){
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const w15 = words[index - 15], w2 = words[index - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) | 0;
    }
    let a=hash[0], b=hash[1], c=hash[2], d=hash[3], e=hash[4], f=hash[5], g=hash[6], h=hash[7];
    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + SHA256_ROUNDS[index] + words[index]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) | 0;
      h=g; g=f; f=e; e=(d+temp1)|0; d=c; c=b; b=a; a=(temp1+temp2)|0;
    }
    hash[0]=(hash[0]+a)|0; hash[1]=(hash[1]+b)|0; hash[2]=(hash[2]+c)|0; hash[3]=(hash[3]+d)|0;
    hash[4]=(hash[4]+e)|0; hash[5]=(hash[5]+f)|0; hash[6]=(hash[6]+g)|0; hash[7]=(hash[7]+h)|0;
 }
 function byte(value:number){block[used++]=value;length++;if(used===64){compress();used=0;block.fill(0);}}
 for(let i=0;i<input.length;i++){
  let n=input.charCodeAt(i);
  if(n>=0xd800&&n<=0xdbff){const low=input.charCodeAt(i+1);if(low>=0xdc00&&low<=0xdfff){n=0x10000+((n-0xd800)<<10)+(low-0xdc00);i++;}else n=0xfffd;}else if(n>=0xdc00&&n<=0xdfff)n=0xfffd;
  if(n<=0x7f)byte(n);else if(n<=0x7ff){byte(0xc0|(n>>>6));byte(0x80|(n&0x3f));}else if(n<=0xffff){byte(0xe0|(n>>>12));byte(0x80|((n>>>6)&0x3f));byte(0x80|(n&0x3f));}else{byte(0xf0|(n>>>18));byte(0x80|((n>>>12)&0x3f));byte(0x80|((n>>>6)&0x3f));byte(0x80|(n&0x3f));}
  if((++characters&4095)===0)await checkpoint();
 }
 const bits=length*8;byte(0x80);while(used!==56)byte(0);
 const high=Math.floor(bits/0x100000000),low=bits>>>0;
 for(let i=24;i>=0;i-=8)byte((high>>>i)&255);for(let i=24;i>=0;i-=8)byte((low>>>i)&255);
 await checkpoint();guard();return Array.from(hash,value=>(value>>>0).toString(16).padStart(8,'0')).join('');
}
