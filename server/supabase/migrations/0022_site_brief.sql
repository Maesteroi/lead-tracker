-- Maestro LT — فهم النشاط لكل موقع (15 نوفمبر · محمود: «لازم قبل اى شئ نفهم البزنس بتاعنا كويس جدا… ونيه البحث»).
-- • offer: كلمات الخدمة اللي الموقع بيقدمها فعلًا (مثلًا: تصريح زواج · موافقة زواج · معقب).
-- • exclude: اللي مش بيقدمه، ومعاه السبب (مثلًا: خطابة «لسنا مكتب زواج» · عقد زواج · استعلام · بنفسي).
-- الاقتراحات (السلبية والإيجابية) بتتبني عليهم: الإيجابية لازم تذكر الخدمة، والسلبية أولها اللي مش خدمتك. RLS من غير سياسات.
create table if not exists site_brief (
  client_id  text primary key references clients(id) on delete cascade,
  offer      text[] not null default '{}',
  exclude    jsonb not null default '[]',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table site_brief enable row level security;
