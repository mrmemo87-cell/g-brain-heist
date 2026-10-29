-- Owner release: layout rebuild of all 38 lesson teacher-library templates (Lessons 01-24, V1-V6, X1-X8), 2026-10-29.
-- Owner request 13:56 Asia/Bishkek: slides showed questions one by one on separate slides, layout unclear, distracting text,
-- workbook page order. Owner approval 14:44 ("approved") after the before/after review (Lesson_Pack_Layout_Review.pdf).
-- Lesson content and versions are unchanged: each template was rebuilt from the same lesson.json (SHA-256 matches the
-- released template's manifest) with --template and the exact recordings taken from the released template (every
-- recording's SHA-256 checked against its manifest; file sets identical). Validated (zero errors, including the new
-- separated-heading check), no slide overflow in HTML or PowerPoint, branded with the production code (no placeholders),
-- uploaded through a one-time endpoint limited to exact paths, sizes and SHA-256, and re-downloaded and verified.
-- Each row changes only if it still holds the exact released template; anything else aborts the whole change.
do $swap$
declare x record; n int;
begin
 for x in select * from (values
  ('IELTS-01','1.2.0','b1285db2b9b6f231849a3b4507ec95ed83394a184ba873bc85b0751d16ee722c','1f7e31cec692c759a9a256006a4170330db4205c9a17ab99a96d2fcfe54997b5',7232481),
  ('IELTS-02','1.1.0','79cfa234b9218fbe159f0dc2ea81f2d82ec85909dfc7247803470c0eb1b22dd6','f06d0d2aba2412eed9e1f7864cf71a62457b079086910f74b2f96e39246f01a1',1229137),
  ('IELTS-03','1.1.0','79250ab44984400dad6fc32b87fa387d715d1df2bf2989f4fcb15efd286fecdc','ad83fd22cddafbc3e43f8d488b281c9c4463dd286560432d3e6dbabb7d140ca3',5971376),
  ('IELTS-04','1.1.0','be95ac685829738485c6cb05dbc97c6a565eb7627b0187334b6aa0d3aa0bc837','04d2cde95c3f3b43f593f6c03a75d66cbbd19d3fa46770d5fa98d028a55d43b3',1251384),
  ('IELTS-05','0.2.0','cd91d566961b623131965fee47b8d3516c940f38a16dcdd869af2b456938cb49','6555dbda50fe563548f11d7026ec1b6694efc7b6a00b8dd88c8c6d94fb44bbcc',16063968),
  ('IELTS-06','0.3.0','07f63b961f1907e35332c462bec2f258165367ef90adda3b77de56b260cf4c5d','379c0ca544b7b600b4ae396725d0678e3d44e9496a4022febdabafd239df0e51',1217577),
  ('IELTS-07','0.2.0','622feb80e0b023a176c4f4199fa9af01bf5d156806b344a5af0b7101f435ce54','eba4bd8b67a61627281073c7092adcbc5d45c5a3eec890061201d5a627f44957',1189805),
  ('IELTS-08','0.2.0','a1c4592b5410bd2a6e9d2b7750ec5c85b6b365cf440b44ea430cbf51bf3a8eec','1edefe3d0dc267df4d476f293d19118b29a36ee7d64321ac05e49c4a48521419',1162421),
  ('IELTS-09','0.3.0','0b4dcbc414192a1f40c48813eff8dd2a379b066e84c203e6206c3c1dca66ee58','2277e9f467cea621bac0c669c3e3124ea2cad5bcaa837efc92ded46985a9da7e',1193707),
  ('IELTS-10','0.3.0','3e51cab3f73e322deaaaba0c1616972f1b3d5a744e58e65a1955b7d6b3571517','bb6157a1f8a7553b0773dd06fda0852066f421beb77a95eb8f4240c9a16b6b56',17752221),
  ('IELTS-11','0.2.0','4df5ca2c0626029e8e9e71f7f7dc5bebfebe4ddf15ddc9108675abb5f51922a4','ffe9e303bc036ea1bac9fb3993d612fa32950fc6eb62114f5bccc7dc1aee9e3c',2125255),
  ('IELTS-12','0.2.0','9c16f6b4c39f39fd428b67da180d6361b3ab2d604cca55bda711bb3e7311bbdd','3bea706a2c5abc0434a8ea558064429bb2f3453d823414ec66043f7864e18f97',1164853),
  ('IELTS-13','0.3.0','236c7321a2e85505cad673b442712a83c3389b3e22796dd302998ba2209d9be9','846e62cdf23ac498c8b60f29d0558270a769be376c899074a684a31d85894055',1179600),
  ('IELTS-14','0.3.0','048911a020c6c52d9b20641e671ff37e4af50a314f3030dcff50b25119b21ff2','3ca34907be2108e9c26a6b3908b202b649f2985fbfcaa01fa1d9f784b3c003b5',15778789),
  ('IELTS-15','0.2.0','25f6806eb89f272779e132e203d4e1564f51613e8a05014b6a31101ffa19cae9','5fe9a00971910fdc6dcdd087e36ef50ee06e051dd0513a66f311854197702840',1170506),
  ('IELTS-16','0.2.0','7a9c036dbb652d0b86956c71430626f9d0d499f4b6e96b1e00626a8f52128d03','7e0adcef8228aa746868fc1b5459085e6dce90e885b0c5da289c33a0acf70b81',1155481),
  ('IELTS-17','0.2.0','6d2843ec3886f63f4c2b0f8b712e4644c703e5a54fe575d988fe4255a518bace','ab7a057d92266453bda2ee1303888ce718f3909b8c642f77147d5a6cd1852514',11937198),
  ('IELTS-18','0.3.0','df62a3ebb15bd3943cf3e258e5587cfb59d770861edfd63fbf4faf937ed1edce','047f61ad3764de9bf45c716430c155a2080ad3f7b5028e7368f5075ee8251b59',1164068),
  ('IELTS-19','0.2.0','e4f793c4178a609f65baae285084f89bbd4b16fd41f09fbd60e847a95ea1e4f8','3e8216646c0b1da68fe9dd282c5eb4554493f35b8f1bcf1cfae350747ee6eac6',1608131),
  ('IELTS-20','0.2.0','5210261f90f15ccc43f75e91c6fccef9f19d15ae9270bfd78d8450b4c6359ade','d60f9804c1bf937d2c0953d7ccd06d81586d274ca2b882e28231ec180eb64e2b',1162874),
  ('IELTS-21','0.3.0','411319914bf68a7be58447885da896e1e74b35e0065da0d1bf3864a56ad17754','7573776ccc35e9a5d35c78d4d8e46ec2058107ad3706945f84b3e86b5b00743d',7173896),
  ('IELTS-22','0.2.0','1eb39bbe6d1a9ad3cb4ec7b46e599603f137cf2d936259ff12e9c89c0787a7d3','8a38cc740af709b7944b31196e98f4929089b12a9f7facc442a19bcc5e198de1',1305034),
  ('IELTS-23','0.2.0','92c7eab3b6e82a217a3e2fba1c7db78e3ef815996e33c2579830b9e1b75112e5','06ba154b0d8113456bb367c676ae0198bf692ead76fbe612ea1f379cc0c2898b',1182246),
  ('IELTS-24','0.2.0','65ea690b46414243e7c845d352a858b231c86df4b1bb8d6878817ea6fdb6ff1d','02e645badc605a4d88aa09d8379281ac1c6c7bc673b3a859bc21980c0fecee26',1149827),
  ('IELTS-V1','1.1.0','b748725cbd343c4f8a08e84adc6b22be1bb190766f185629be5c3023d1516a7f','8cdef1b749abe1ab38726a72f4ad522cb77ec6623150143f7a235a6f8575469a',1254331),
  ('IELTS-V2','1.1.0','9fffdd2f2374d794d7f20b65bcfc77b465d38c1e431b68de2466671c36756ccc','8987015405c14b9babacc6b0c0bae4c0b8b185b9f8e268e24289268632e60e88',2440912),
  ('IELTS-V3','1.1.0','c2811a13dbe8c7be5d3572166a42354034e42976f7c4604f6d28d8a04bb94a75','cab6304dc8f474809c0ac44870e491c2001e8a18a8425279f20d9a074f680841',1241374),
  ('IELTS-V4','1.1.0','b245b9ab5276a7bcaf28b10c22993a3614a3748ed22490d9336c96eadac5303d','7cd5f6a8cf3768432e7e0acac62976570463b9ef298122d3a3fc3f5716f1913b',1243718),
  ('IELTS-V5','1.1.0','ecadce61cfdb9ddd7d3f1a3ff3e97e23c6a635adec3f20da60ddac8f20e1bd91','b466940a7903947c6acb9dbe6fbe5f6ac705d41ccc1f97223fa552dbe83c1b50',1255867),
  ('IELTS-V6','1.1.0','918c63e9bb99bc4ead14620d16419ee4133bf0eb583a11008c08d4632440e785','0b254f8374685cd120e37580098ac9fb42142872310287b28027a1b07b3583af',1253970),
  ('IELTS-X1','1.1.1','e3a1e798f1e69f955ea1ab4f7c8aeaf7cb365ea1326e9355c75379e72e12c995','8cc39bfd7031b449f57f5f429c0bd70277136d7a7fce13ba05783e060a0bb899',1198857),
  ('IELTS-X2','1.1.1','b35a62fc5bb0e9f86453a7b3c35237a88e40b0419f23b76b48f3d23836c0de04','3e4b0c827321f73faf1a22242ff22b2cfbc65636e13facce2105303529d043b5',1186036),
  ('IELTS-X3','1.1.1','b3dc0beacddaff151617920a5421dae4db2c691b54c896e413163f346bf91326','9dfdb8c0ae66b0e75ecc6fcac95554477a5648cdafe626dc7d05c3b00fa6fbd4',1504334),
  ('IELTS-X4','1.1.1','f4d7c61ec41bb0ec64512555f1e6fcf4805c405fb39871430b10d09375c1c1f2','699badae1507df4a4011ab8025aab212ae093aa16e87140b4e5fad68cfe07938',8634603),
  ('IELTS-X5','1.1.0','ad70402db222696cc2573844df29ac3cab1945611aa8529a7e810dfb67bf3ff9','d0255f7b4232f912469d6e70193cd8c95e565788afc1ca8242d297ba88ab734a',2332775),
  ('IELTS-X6','1.1.0','0bcc7ba7c4126ef000b1fbc20b5d607efe4991251985a5d0005bdd50bf868af2','f6e2062cbeab439e15b6a9a842561be66426c3db14507a0f155cbc30f70502ad',1839527),
  ('IELTS-X7','1.1.0','22a60c30e293a199bc9de96a178a0294328e9d0cb4471e34f95dc53ba2216e1b','78b325b2fcd117431632cf6f108682503b92f80be308dcf302171995a9955212',2490961),
  ('IELTS-X8','1.1.0','04d19daa21bb262979ebf6ba86e85392de9dc6bec7a324987c7c9c5916941c68','8b3570a3577e90b4eb7a8d018cacd11964d1114b511c0e47f4a4bb364ce64757',1172916)
 ) v(code, ver, old_sha, new_sha, size) loop
  if not exists (select 1 from storage.objects where bucket_id = 'ielts-teacher-course-packs'
     and name = 'templates/' || x.code || '/' || x.ver || '/' || x.new_sha || '.zip' and (metadata->>'size')::int = x.size) then
   raise exception 'template_object_missing: %', x.code; end if;
  update private.ielts_teacher_pack_templates
     set object_path = 'templates/' || x.code || '/' || x.ver || '/' || x.new_sha || '.zip', sha256 = x.new_sha,
         size_bytes = x.size, released_at = now(),
         authorization_basis = authorization_basis || ' Layout rebuild approved by the owner on 2026-10-29 14:44 Asia/Bishkek (''approved''): whole question sets per slide, one-click answer keys, clearer workbook; same lesson content and recordings; previous template ' || x.old_sha || ' superseded.'
   where lesson_code = x.code and version = x.ver and sha256 = x.old_sha;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected_one_template_row: %', x.code; end if;
 end loop;
end;$swap$;
