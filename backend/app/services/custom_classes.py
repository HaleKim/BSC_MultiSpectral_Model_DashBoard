import torch
import torch.nn as nn
from ultralytics.nn.modules.block import C3, C2f, Bottleneck
from ultralytics.nn.modules.conv import Conv


# ── Silence / SilenceChannel ─────────────────────────────
class Silence(nn.Module):
    def __init__(self):
        super(Silence, self).__init__()
    def forward(self, x):
        return x

class SilenceChannel(nn.Module):
    def __init__(self,c_start, c_end):
        super(SilenceChannel, self).__init__()
        self.c_start=c_start
        self.c_end = c_end
    def forward(self, x):
        return x[...,self.c_start:self.c_end, :,:]
    


# ── C3k / C3k2 ───────────────────────────────────────────
class C3k(C3):
    def __init__(self, c1, c2, n=1, shortcut=True, g=1, e=0.5, k=3):
        super().__init__(c1, c2, n, shortcut, g, e)
        c_ = int(c2 * e)
        # RepBottleneck을 쓰던 포크라면 해당 클래스도 복사 후 아래 줄로 교체
        # self.m = nn.Sequential(*(RepBottleneck(c_, c_, shortcut, g, k=(k, k), e=1.0) for _ in range(n)))
        self.m = nn.Sequential(*(Bottleneck(c_, c_, shortcut, g, k=(k, k), e=1.0) for _ in range(n)))

class C3k2(C2f):
    def __init__(self, c1, c2, n=1, c3k=False, e=0.5, g=1, shortcut=True):
        super().__init__(c1, c2, n, shortcut, g, e)
        self.m = nn.ModuleList(
            C3k(self.c, self.c, 2, shortcut, g) if c3k else Bottleneck(self.c, self.c, shortcut, g)
            for _ in range(n)
        )


# ── Attention / PSABlock / C2PSA ────────────────────────
class Attention(nn.Module):
    """
    dim: 입력 채널 수, num_heads: 헤드 수, attn_ratio: key 차원 비율
    """
    def __init__(self, dim, num_heads=8, attn_ratio=0.5):
        super().__init__()
        assert num_heads >= 1 and dim % num_heads == 0, "dim must be divisible by num_heads" # 추가된 줄
        self.num_heads = num_heads
        self.head_dim = dim // num_heads
        self.key_dim = max(1, int(self.head_dim * attn_ratio)) # 달라진 부분
        self.scale = self.key_dim ** -0.5

        nh_kd = self.key_dim * num_heads        # 합산한 key 채널 수
        h = dim + nh_kd * 2                     # q,k,v 전체 채널
        self.qkv = Conv(dim, h, 1, act=False)
        self.proj = Conv(dim, dim, 1, act=False)
        self.pe   = Conv(dim, dim, 3, 1, g=dim, act=False)  # depthwise pos-encoding

    def forward(self, x):
        B, C, H, W = x.shape
        N = H * W
        qkv = self.qkv(x)                       # (B, h, H, W)
        qkv = qkv.reshape(B, self.num_heads, self.key_dim*2 + self.head_dim, N) # 추가된 부분
        q, k, v = qkv.split([self.key_dim, self.key_dim, self.head_dim], dim=2)
        # (B, h, N, N)
        attn = (q.transpose(-2, -1) @ k) * self.scale
        attn = attn.softmax(dim=-1)
        # (B, h, head_dim, N) @ (B, h, N, N) -> (B, h, head_dim, N)
        x_out = v @ attn.transpose(-2, -1) # 바뀐 부분
        x_out = x_out.reshape(B, C, H, W) + self.pe(v.reshape(B, C, H, W))
        return self.proj(x_out)
    


class PSABlock(nn.Module):
    def __init__(self, c, attn_ratio=0.5, num_heads=4, shortcut=True):
        super().__init__()
        self.attn = Attention(c, attn_ratio=attn_ratio, num_heads=max(1, int(num_heads))) # 바뀐 부분 
        self.ffn  = nn.Sequential(Conv(c, c*2, 1), Conv(c*2, c, 1, act=False))
        self.add  = shortcut
    def forward(self, x):
        x = x + self.attn(x) if self.add else self.attn(x)
        x = x + self.ffn(x)  if self.add else self.ffn(x)
        return x
    


class C2PSA(nn.Module):
    def __init__(self, c1, c2, n=1, e=0.5):
        super().__init__()
        assert c1 == c2
        self.c   = int(c1 * e)
        self.cv1 = Conv(c1, 2*self.c, 1, 1)
        self.cv2 = Conv(2*self.c, c1, 1)
        self.m   = nn.Sequential(*(PSABlock(self.c, attn_ratio=0.5, num_heads=max(1, self.c // 64)) for _ in range(n))) # 바뀐 부분
    def forward(self, x):
        a, b = self.cv1(x).split((self.c, self.c), dim=1)
        b = self.m(b)
        return self.cv2(torch.cat((a, b), 1))
    


# (선택) 나중에 호출: 울트라리틱스 네임스페이스 등록
def register_into_ultralytics():
    import ultralytics.nn.modules as M
    import ultralytics.nn.modules.block as B
    import ultralytics.nn.modules.conv as Cmod
    Cmod.Silence = Silence;          M.Silence = Silence
    Cmod.SilenceChannel = SilenceChannel; M.SilenceChannel = SilenceChannel
    B.C3k = C3k;     M.C3k = C3k
    B.C3k2 = C3k2;   M.C3k2 = C3k2
    B.PSABlock = PSABlock; M.PSABlock = PSABlock
    B.C2PSA = C2PSA; M.C2PSA = C2PSA
    B.Attention = Attention; M.Attention = Attention