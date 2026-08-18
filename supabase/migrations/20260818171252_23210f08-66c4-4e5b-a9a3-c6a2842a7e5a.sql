update public.tasks set title = v.t from (values
 ('32ac61eb-43e3-4c0c-8a88-e274093ac0ad'::uuid,'Join Gram X'),
 ('097b5900-2ea9-4983-b7b2-e6c9fe259b47'::uuid,'Play Outmine'),
 ('248d940d-5223-48f1-850d-64066b484194'::uuid,'Join SenseTime'),
 ('a9be7a53-9f78-4b09-81b4-3a2a23dc62ee'::uuid,'Join Gram Events'),
 ('dfabebd4-742f-4908-876f-a7530e3b9bfb'::uuid,'Join Moon Arena'),
 ('26de6244-c624-486e-8f2f-aa61161b502a'::uuid,'Join Gold Bux'),
 ('0951eb02-27d0-47a8-a945-046b1671023d'::uuid,'Play Pixel Paw'),
 ('6e257a7b-52a6-49be-ad0f-b55faa6ad7c9'::uuid,'Spin Boinkers Slot'),
 ('3c6e02f5-139b-44d5-a73e-4dd7e973be87'::uuid,'Join Pokergram'),
 ('20c06ea7-32fa-4f07-b00e-e3d5c5475493'::uuid,'Open Tinlake'),
 ('078498df-1532-4b21-93bd-f470eac0b0cf'::uuid,'Surf and Earn'),
 ('eaddc257-cb38-4102-ae92-01f38b00fc44'::uuid,'Open Money Bux'),
 ('d863e891-1a40-46fb-982a-7a9165b54969'::uuid,'Play Tower Chests'),
 ('557c3bc8-5d2f-4285-ba9a-0c7788659b80'::uuid,'Spin the Wheel'),
 ('0c3014e7-5978-4d1e-87c9-1ff43a3ffbb2'::uuid,'Join Our Community'),
 ('aa08cda6-c14d-4903-ad4e-b347e2eb40eb'::uuid,'Play ClawQuest')
) as v(id, t) where public.tasks.id = v.id;

update public.tasks set is_pinned = true where id = '0c3014e7-5978-4d1e-87c9-1ff43a3ffbb2';